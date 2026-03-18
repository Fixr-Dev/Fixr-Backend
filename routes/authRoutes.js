const express = require("express");
const router = express.Router();
const multer = require('multer'); // Must be imported before use
const { requestOtp, verifyOtp, getMe, updateProfile, handleUpload } = require("../controllers/authController.js");
const { protect } = require("../middleware/authMiddleware.js");

// Initialize multer
const upload = multer({ storage: multer.memoryStorage() });

router.get("/me", protect, getMe);
router.post("/request-otp", requestOtp);
router.post("/verify-otp", verifyOtp);
router.put('/update-profile', protect, updateProfile);

// FIXED: Pass the handleUpload function as the second callback
router.post('/upload', upload.single('image'), handleUpload); 

module.exports = router;