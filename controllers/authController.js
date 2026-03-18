const User = require("../models/UserModel.js");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");


const { MINIO_ENDPOINT,MINIO_ACCESS_KEY,MINIO_BUCKET,MINIO_SCECRET_KEY,BASE_URL,OTP_GATEWAY_URL,JWT_EXPIRY,JWT_SECRET} =process.env


// --- 0. MinIO Configuration ---
const s3Client = new S3Client({
    region: "us-east-1",
    endpoint: MINIO_ENDPOINT, // Ensure this matches your docker-compose service name
    credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SCECRET_KEY,
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
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    try {
        const parallelUploads3 = new Upload({
            client: s3Client,
            params: { 
                Bucket: MINIO_BUCKET, 
                Key: `uploads/${Date.now()}-${req.file.originalname}`, 
                Body: req.file.buffer,
                ContentType: req.file.mimetype 
            },
        });

        const result = await parallelUploads3.done();
        // Replace 'localhost' with your actual Server IP for mobile access
        const fileUrl = `${BASE_URL}/fixr-uploads/${result.Key}`;
        
        res.status(200).send({ success: true, url: fileUrl });
    } catch (error) {
        res.status(500).send({ error: error.message });
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
        const { fullName, email, city, address, profileImage } = value;
        if (fullName) {
          if (fullName.trim().length < 2) return res.status(400).json({ message: "Name too short" });
          updateData.fullName = fullName.trim();
        }
        if (email) {
          updateData.email = email.toLowerCase().trim();
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


// EXPORT ALL FUNCTIONS
module.exports = { requestOtp, verifyOtp, getMe, updateProfile, handleUpload };