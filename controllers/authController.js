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
    // req.user.id comes from your JWT middleware (which we will create next)
    const user = await User.findById(req.user.id).select("-otp");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json({ success: true, user });
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
    const { category, minPrice, maxPrice } = req.query;
    let filter = { is_active: true };

    if (category) filter.category = category;
    if (minPrice || maxPrice) {
      filter.starting_price = { 
        $gte: minPrice || 0, 
        $lte: maxPrice || 100000 
      };
    }

    const techs = await Technician.find(filter).populate({
        path: 'userId',
        select: 'fullName profileImage location' // Pulls common data from UserModal
    });
    
    res.status(200).json(techs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTechnicianProfile = async (req, res) => {
  try {
    const tech = await Technician.findOne({ userId: req.params.userId }).populate('userId');
    if (!tech) return res.status(404).json({ message: "Profile not found" });
    res.status(200).json(tech);
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