const Technician = require("../models/TechnicianModel.js");
const dotenv = require('dotenv');
const User = require("../models/UserModel.js");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

dotenv.config()
const { 
    FILEBASE_ACCESS_KEY, 
    FILEBASE_SECRET_KEY, 
    FILEBASE_BUCKET, 
    PORT, 
    BASE_URL, 
    OTP_GATEWAY_URL, 
    JWT_EXPIRY, 
    JWT_SECRET, 
    NODE_ENV 
} = process.env

// const isDev = NODE_ENV === `development`
const isDev = true

// --- 0. Filebase S3 Configuration ---
const s3Client = new S3Client({
    region: "us-east-1", // Filebase expects us-east-1 as a default value
    endpoint: "https://s3.filebase.io", 
    credentials: {
        accessKeyId: FILEBASE_ACCESS_KEY,
        secretAccessKey: FILEBASE_SECRET_KEY,
    },
    forcePathStyle: true, // Required for Filebase compatibility
});

const otpStore = {}; 

// --- 1. Request OTP ---
const requestOtp = async (req, res) => {
    const { phone } = req.body;
    
    if (!phone) {
        return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    try {
        // 1. Generate OTP (Hardcoded for dev, random for prod)
        const generatedOtp = isDev ? "0000" : Math.floor(1000 + Math.random() * 9000).toString();
        
        // 2. Store it so the verify-otp endpoint can see it
        otpStore[phone] = generatedOtp;

        // 3. Short-circuit if in Dev Mode
        if (isDev) {
            console.log(`[DEV] OTP for ${phone}: ${generatedOtp}`);
            return res.status(200).json({ 
                success: true, 
                message: "Dev mode: Use 0000" 
            });
        }

        // 4. Production Only: Send the actual SMS
        const message = `Your Fixr OTP is: ${generatedOtp}`;
        
        // Auto-delete from memory after 5 mins
        setTimeout(() => delete otpStore[phone], 5 * 60 * 1000);

        await axios.get(OTP_GATEWAY_URL, {
            params: { phone, message },
            timeout: 5000 
        });

        return res.status(200).json({ success: true, message: "OTP sent" });

    } catch (error) {
        console.error("SMS Gateway Error:", error.message);
        return res.status(500).json({ 
            success: false, 
            message: "SMS Gateway Offline or Provider Error" 
        });
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

// --- 3. Upload to Filebase ---
const handleUpload = async (req, res) => {
    // 1. Check if Multer caught the file
    if (!req.file) {
        return res.status(400).json({ 
            success: false, 
            message: "No file received by the server." 
        });
    }

    try {
        // 2. Create a unique key for storage
        const fileExtension = req.file.originalname.split('.').pop();
        const fileKey = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
        
        console.log(`🚀 Uploading ${req.file.originalname} to Filebase as ${fileKey}...`);

        // 3. Setup the Parallel Upload
        const parallelUploads3 = new Upload({
            client: s3Client, 
            params: { 
                Bucket: FILEBASE_BUCKET, 
                Key: fileKey, 
                Body: req.file.buffer, 
                ContentType: req.file.mimetype 
            },
        });

        await parallelUploads3.done();
        
        console.log("✅ Upload Complete:", fileKey);
        res.status(200).send({ success: true, key: fileKey });

    } catch (error) {
        console.error("❌ Filebase Storage Error:", error);
        res.status(500).send({ 
            success: false, 
            message: "Failed to write to cloud storage array", 
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
    let technicianProfile = {}

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
      user: {...completeUser, ...technicianProfile} 
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- 4. Update User Profile (PUT) ---
const updateProfile = async (req, res) => {
    try {
      const userId = req.user.id;
      const { type, value } = req.body;
      let updateData = {};

      switch (type) {
        case "personal_details":
          // Destructure all incoming fields from value
          const { 
            fullName, email, city, address, 
            coordinates, isAvailable, profileImage, 
            languages, gender 
          } = value;

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

          if (languages) {
            updateData.languages = languages;
          }

          if (profileImage) {
            updateData.profileImage = profileImage;
          }

          if (typeof isAvailable !== 'undefined') {
            updateData.isAvailable = isAvailable;
          }

          if (city || address || coordinates) {
            // 1. Get existing values to prevent overwriting with nulls
            const existingLoc = req.user.location || {};
            const existingCoords = existingLoc.coordinates || [0.0, 0.0];

            let newLng = existingCoords[0];
            let newLat = existingCoords[1];

            // 2. Handle the Payload Array: [82.185081, 27.410189]
            if (Array.isArray(coordinates) && coordinates.length === 2) {
              const lng = parseFloat(coordinates[0]);
              const lat = parseFloat(coordinates[1]);

              // Only update if they are valid numbers (prevents NaN crashes)
              if (!isNaN(lng) && !isNaN(lat)) {
                newLng = lng;
                newLat = lat;
              }
            } 
            // Optional: Handle object format if sent from other parts of the app
            else if (coordinates && typeof coordinates === 'object') {
              const lat = coordinates.latitude || coordinates.lat;
              const lng = coordinates.longitude || coordinates.lng;
              if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
                newLng = parseFloat(lng);
                newLat = parseFloat(lat);
              }
            }

            // 3. Construct the updateData according to your Schema
            updateData.location = {
              type: "Point",
              coordinates: [newLng, newLat], // [Longitude, Latitude]
              address: address !== undefined ? address.trim() : existingLoc.address,
              city: city !== undefined ? city.trim() : existingLoc.city
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

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.status(200).json({ success: true, user: updatedUser });
    } catch (error) {
      console.error("Update Profile Error:", error);
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

    // 1. Geospatial Search (Automatic sorting by distance starts here)
    if (lat && lng) {
      pipeline.push({
        $geoNear: {
          near: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          distanceField: "distance",
          maxDistance: parseInt(radius) * 1000,
          spherical: true,
          query: { roles: "technician" } 
        }
      });
    } else {
      pipeline.push({ $match: { roles: "technician" } });
    }

    // 2. Join with Technicians Collection
    pipeline.push({
      $lookup: {
        from: "technicians", 
        localField: "userId",
        foreignField: "userId", 
        as: "techDetails"
      }
    });

    // 3. Flatten techDetails
    pipeline.push({ 
      $unwind: {
        path: "$techDetails",
        preserveNullAndEmptyArrays: true 
      }
    });

    // 4. Text Search
    if (search && search.trim() !== "") {
      pipeline.push({
        $match: {
          $or: [
            { fullName: { $regex: search, $options: "i" } },
            { "techDetails.profession": { $regex: search, $options: "i" } },
            { "techDetails.skills": { $in: [new RegExp(search, "i")] } }
          ]
        }
      });
    }

    // 5. Merge all fields and return
    pipeline.push({
      $project: {
        user_data: "$$ROOT", 
        tech_data: "$techDetails",
        distance: 1
      }
    });

    // 6. Explicit Sort by Distance (Ascending)
    pipeline.push({ $sort: { distance: 1 } });

    const results = await User.aggregate(pipeline);

    // Flattening the response so fields aren't nested under 'user_data'
    const flattenedTechs = results.map(item => {
      const { user_data, tech_data, distance } = item;
      return { 
        ...user_data, 
        ...tech_data, 
        distance,
        techDetails: undefined 
      };
    });

    res.status(200).json(flattenedTechs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTechnicianProfile = async (req, res) => {
  try {
    const tech = await Technician.findOne({ userId: req.params.userId }).lean();
    const user = await User.findOne({ userId: req.params.userId }).lean();

    if (!tech || !user) {
      return res.status(404).json({ message: "Technician profile not found" });
    }

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
    await Technician.findOneAndDelete({ userId: req.params.userId });

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
module.exports = { requestOtp, registerTechnician, getAllTechnicians, getTechnicianProfile, updateTechnician, deleteTechnicianProfile, verifyOtp, getMe, updateProfile, handleUpload };