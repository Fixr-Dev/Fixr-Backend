const express = require("express");
const router = express.Router();
// Destructuring the functions from the controller
const { requestOtp, verifyOtp, getMe, updateProfile } = require("../controllers/authController.js");
// Importing the protect middleware
const { protect } = require("../middleware/authMiddleware.js");

router.get("/me", protect, getMe);
router.post("/request-otp", requestOtp);
router.post("/verify-otp", verifyOtp) ;
router.put('/update-profile', protect, updateProfile); 

module.exports = router;

//