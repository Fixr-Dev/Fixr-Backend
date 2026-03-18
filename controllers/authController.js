const User = require("../models/UserModel.js");
const jwt = require("jsonwebtoken");
const axios = require("axios");
// Temporary in-memory store (Phone: OTP)
const otpStore = {}; 

// --- 1. Request OTP (Real Integration) ---
const requestOtp = async (req, res) => {
  const { phone } = req.body;
  
  if (!phone) {
    return res.status(400).json({ message: "Phone number is required" });
  }

  try {
    // 1. Generate 4-digit OTP
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
    
    // 2. Save to store (expires in 5 mins)
    otpStore[phone] = generatedOtp;
    setTimeout(() => delete otpStore[phone], 5 * 60 * 1000);

    const message = `Your Fixr OTP is: ${generatedOtp}`;

    // 3. Trigger Local SMS Gateway
    // We use axios.get because your working URL is a GET request with query params
    await axios.get(`http://192.168.1.6:8080/send-sms`, {
      params: {
        phone: phone,
        message: message
      },
      // Keep the timeout short so your backend doesn't hang if the phone disconnects
      timeout: 5000 
    });

    console.log(`[Success] OTP ${generatedOtp} sent to ${phone} via Local Gateway`);

    return res.status(200).json({ 
      success: true, 
      message: "OTP sent to your phone" 
    });

  } catch (error) {
    console.error("Gateway Error:", error.message);
    
    // Fallback: If the local phone is offline/disconnected
    return res.status(500).json({ 
      success: false, 
      message: "SMS Gateway is currently offline. Please try again later." 
    });
  }
};

// --- 2. Verify OTP & Login/Register ---
const verifyOtp = async (req, res) => {
  const { phone, otp, fullName } = req.body;

  // Real OTP Check
  if (!otpStore[phone] || otpStore[phone] !== otp) {
    return res.status(400).json({ message: "Invalid or expired OTP" });
  }

  try {
    let user = await User.findOne({ phone });

    if (!user) {
      if (!fullName) return res.status(400).json({ message: "Full Name required for new users" });
      user = await User.create({ 
        phone, 
        fullName,
        role: 'customer',
      });
    }

    // Clean up OTP after successful login
    delete otpStore[phone];

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        phone: user.phone,
        fullName: user.fullName,
        role: user.role,
        theme: user.theme
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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

module.exports = { requestOtp, verifyOtp, getMe, updateProfile };

//