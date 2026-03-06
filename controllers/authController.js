import User from "../models/UserModel.js";
import jwt from "jsonwebtoken";

// --- 1. Request OTP (Pseudo) ---
export const requestOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: "Phone number is required" });

  try {
    // In a real app, you'd trigger an SMS gateway here.
    // For now, we just acknowledge the request.
    res.status(200).json({ 
      success: true, 
      message: "OTP sent successfully (Use 0000)" 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// --- 2. Verify OTP & Login/Register ---
export const verifyOtp = async (req, res) => {
  const { phone, otp, fullName } = req.body; // fullName only needed for new users

  // Pseudo OTP Check
  if (otp !== "0000") {
    return res.status(400).json({ message: "Invalid OTP" });
  }

  try {
    let user = await User.findOne({ phone });

    // If user doesn't exist, create a new one
    if (!user) {
      if (!fullName) return res.status(400).json({ message: "Full Name required for new users" });
      user = await User.create({ 
        phone, 
        fullName,
        role: 'customer', // Default role
        email:""
      });
    }

    // Generate JWT
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

export const getMe = async (req, res) => {
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
export const updateProfile = async (req, res) => {
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