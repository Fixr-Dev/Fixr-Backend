const Technician = require("../models/TechnicianModel.js");
const User = require("../models/UserModel.js");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { MINIO_ENDPOINT,PORT,MINIO_PORT,MINIO_ACCESS_KEY,MINIO_BUCKET,MINIO_SECRET_KEY,BASE_URL,OTP_GATEWAY_URL,JWT_EXPIRY,JWT_SECRET} =process.env


// --- 0. MinIO Configuration ---
const s3Client = new S3Client({
    region: "us-east-1",
    endpoint: `http://${MINIO_ENDPOINT}:${MINIO_PORT}`, // Ensure this matches your docker-compose service name
    credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
    },
    forcePathStyle: true,
});

const otpStore = {}; 

// --- 1. Request OTP ---
const requestOtp = async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Phone number is required" });

    try {
        const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
        otpStore[phone] = generatedOtp;
        setTimeout(() => delete otpStore[phone], 5 * 60 * 1000);

        const message = `Your Fixr OTP is: ${generatedOtp}`;

        await axios.get(OTP_GATEWAY_URL, {
            params: { phone, message },
            timeout: 5000 
        });

        return res.status(200).json({ success: true, message: "OTP sent" });
    } catch (error) {
        return res.status(500).json({ success: false, message: "SMS Gateway Offline" });
    }
};

// --- 2. Verify OTP ---
const verifyOtp = async (req, res) => {
    const { phone, otp, fullName } = req.body;
    if (!otpStore[phone] || otpStore[phone] !== otp) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    try {
        let user = await User.findOne({ phone });
        if (!user) {
            if (!fullName) return res.status(400).json({ message: "Full Name required" });
            user = await User.create({ phone, fullName, role: 'customer' });
        }
        delete otpStore[phone];
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
        res.status(200).json({ success: true, token, user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- 3. Upload to MinIO ---


const handleUpload = async (req, res) => {
    // 1. Check if Multer caught the file
    if (!req.file) {
        return res.status(400).json({ 
            success: false, 
            message: "No file received by the server." 
        });
    }

    try {
        // 2. Create a unique key for your 10 HDD storage
        const fileExtension = req.file.originalname.split('.').pop();
        const fileKey = `uploads/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
        
        console.log(`🚀 Uploading ${req.file.originalname} to MinIO as ${fileKey}...`);

        // 3. Setup the Parallel Upload
        const parallelUploads3 = new Upload({
            client: s3Client, // Your MinIO S3 client configuration
            params: { 
                Bucket: MINIO_BUCKET, 
                Key: fileKey, 
                Body: req.file.buffer, // <--- THIS IS THE MAGIC BUFFER
                ContentType: req.file.mimetype 
            },
        });

        await parallelUploads3.done();
        
        console.log("✅ Upload Complete:", fileKey);
        res.status(200).send({ success: true, key: fileKey });

    } catch (error) {
        console.error("❌ MinIO Storage Error:", error);
        res.status(500).send({ 
            success: false, 
            message: "Failed to write to storage array", 
            error: error.message 
        });
    }
};

const getMe = async (req, res) => {
  try {
    // 1. Fetch User (Exclude OTP, use .lean() for easier merging)
    const user = await User.findById(req.user.id).select("-otp").lean();
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Check if "technician" exists inside the role array
    const isTech = user.roles && user.roles.includes("technician");
    let technicianProfile= {}

    let completeUser = { ...user };

    // 3. If they have the technician role, go grab their professional profile
    if (isTech) {
      const techProfile = await Technician.findOne({ userId: user.userId }).lean();
      
      if (techProfile) {
        // Nest the professional data so it doesn't overwrite base user data
        technicianProfile = techProfile;
      }
    }

    // 4. Return the full "Super Object"
    res.status(200).json({ 
      success: true, 
      user: {...completeUser,...technicianProfile} 
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- 3. Update User Profile (PUT) ---

const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, value } = req.body;
    let updateData = {};
    switch (type) {
      case "personal_details":
        // Value expected: { fullName, email, city, profileImage }
        const { fullName, email, city, address, profileImage,language,gender } = value;
        if (fullName) {
          if (fullName.trim().length < 2) return res.status(400).json({ message: "Name too short" });
          updateData.fullName = fullName.trim();
        }
        if (email) {
          updateData.email = email.toLowerCase().trim();
        }
        if (gender) {
          updateData.gender = gender.trim();
        }
        if (language) {
          updateData.language = language;
        }
        if (profileImage) {
          // Basic check to ensure it's a valid URL string
          updateData.profileImage = profileImage;
        }       
        if (city) {
          updateData.location = {
            ...req.user.location,
            address: address.trim(),
            city: city.trim()
          };
        }
        break;
      case "availability":
        updateData = { isAvailable: !!value };
        break;
      case "theme":
        updateData = { theme: value };
      break;
      default:
        return res.status(400).json({ message: "Invalid update type" });
    }
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-otp -otpExpires");
    res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const registerTechnician = async (req, res) => {
  try {
    const { userId, ...techData } = req.body;

    // 1. Check if user exists
    const user = await User.findOne({ userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. Check if already a technician to prevent duplicates
    if (user.roles.includes("technician")) {
      return res.status(400).json({ message: "User is already a technician" });
    }

    // 3. Create Technician Profile
    const newTech = new Technician({ userId, ...techData });
    await newTech.save();

    // 4. Update User Role (Promote)
    user.roles.push("technician");
    await user.save();

    res.status(201).json({ message: "Technician registered successfully", data: newTech });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllTechnicians = async (req, res) => {
  try {
    const { lat, lng, search, radius = 30 } = req.query;
    const pipeline = [];

    // 1. Geospatial Search (Coordinates must be [lng, lat])
    if (lat && lng) {
      pipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          distanceField: "distance",
          maxDistance: parseInt(radius) * 1000, // KM to Meters
          spherical: true,
          query: { roles: "technician" } 
        }
      });
    } else {
      pipeline.push({ $match: { roles: "technician" } });
    }

    // 2. Join with the technicians collection
    pipeline.push({
      $lookup: {
        from: "technicians", 
        localField: "_id",
        foreignField: "user", 
        as: "techData"
      }
    });

    // 3. Flatten the joined array
    pipeline.push({ 
      $unwind: {
        path: "$techData",
        preserveNullAndEmptyArrays: true 
      }
    });

    // 4. Text Search (Search name or profession)
    if (search && search.trim() !== "") {
      pipeline.push({
        $match: {
          $or: [
            { fullName: { $regex: search, $options: "i" } },
            { "techData.profession": { $regex: search, $options: "i" } }
          ]
        }
      });
    }

    // 5. Merge all fields into the top level
    pipeline.push({
      $replaceRoot: { 
        newRoot: { $mergeObjects: ["$techData", "$$ROOT"] } 
      }
    });

    // 6. Final cleanup and sorting
    pipeline.push({
      $project: { techData: 0 }, // Remove the extra nested object
      $sort: { distance: 1 }      // Nearest first
    });

    const results = await User.aggregate(pipeline);
    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTechnicianProfile = async (req, res) => {
  try {
    // .lean() tells Mongoose to return a plain JS object, making it faster and cleaner
    const tech = await Technician.findOne({ userId: req.params.userId }).lean();
    const user = await User.findOne({ userId: req.params.userId }).lean();

    if (!tech || !user) {
      return res.status(404).json({ message: "Technician profile not found" });
    }

    // Merge them: tech properties will override user properties if keys collide
    // (e.g., both have 'createdAt', tech's version will be kept)
    const profile = { ...user, ...tech };

    res.status(200).json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateTechnician = async (req, res) => {
  try {
    const updatedTech = await Technician.findOneAndUpdate(
      { userId: req.params.userId },
      { $set: req.body },
      { new: true }
    );
    res.status(200).json(updatedTech);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteTechnicianProfile = async (req, res) => {
  try {
    // 1. Remove tech profile
    await Technician.findOneAndDelete({ userId: req.params.userId });

    // 2. Downgrade User Role (Optional: remove 'technician' from array)
    await User.findOneAndUpdate(
      { userId: req.params.userId },
      { $pull: { roles: "technician" } }
    );

    res.status(200).json({ message: "Technician status removed" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// EXPORT ALL FUNCTIONS
module.exports = { requestOtp,registerTechnician,getAllTechnicians,getTechnicianProfile,getTechnicianProfile,updateTechnician,deleteTechnicianProfile, verifyOtp, getMe, updateProfile, handleUpload };