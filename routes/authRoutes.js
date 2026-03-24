const express = require("express");
const router = express.Router();
const multer = require('multer'); // Must be imported before use
const { requestOtp, verifyOtp,getTechnicianProfile, getMe, updateProfile, handleUpload ,registerTechnician,getAllTechnicians,updateTechnician,deleteTechnicianProfile} = require("../controllers/authController.js");
const { protect } = require("../middleware/authMiddleware.js");

// Initialize mulxter
const storage = multer.memoryStorage(); // Mandatory for MinIO/S3 buffers xxxx
const upload = multer({ storage: storage ,limits: { fileSize: 200 * 1024 * 1024 }});

router.get("/me", protect, getMe);
router.post("/request-otp", requestOtp);
router.post("/verify-otp", verifyOtp);
router.put('/update-profile', protect, updateProfile);

// FIXED: Pass the handleUpload function as the second callback
// router.post('/upload', upload.single('image'), handleUpload);
router.post('/upload', (req, res, next) => {
    console.log("Raw Headers:", req.headers['content-type']); 
    next();
}, upload.single('file'), handleUpload); 


// PROMOTION: Convert existing customer to technician
router.post("/register", registerTechnician);

// READ: Get profile (Public) or list all (with filters)
router.get("/tech/", getAllTechnicians);
router.get("/tech/:userId", getTechnicianProfile);

// UPDATE: Update professional details
router.put("/tech/update/:userId", updateTechnician);

// DELETE: Remove technician status (Optional: keeps user, removes pro profile)
router.delete("/tech/remove/:userId", deleteTechnicianProfile);

module.exports = router;

