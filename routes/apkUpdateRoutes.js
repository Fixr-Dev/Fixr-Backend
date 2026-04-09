const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs'); // Added for file checking
const apkUpdateController = require('../controllers/apkUpdateController');

// 1. Define paths
const updatesFolder = path.join(__dirname, '../../updates');
// Assuming your APK is stored in a folder called 'bin' or 'builds'
const apkFolder = path.join(__dirname, '../../updates/apks'); 

// 2. Serve static bundle (OTA)
router.use('/updates', express.static(updatesFolder, {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }
}));

/**
 * 3. APK Download Endpoint
 * Access this via: your-tunnel-url/api/download-apk
 */
router.get('/download-apk', (req, res) => {
    try {
        // Read the directory to find the APK file
        const files = fs.readdirSync(apkFolder);
        const apkFile = files.find(file => file.endsWith('.apk'));

        if (!apkFile) {
            return res.status(404).json({ error: "No .apk file found in the storage folder." });
        }

        const filePath = path.join(apkFolder, apkFile);

        // Serve the file
        res.download(filePath, apkFile, (err) => {
            if (err) {
                console.error("Error during download:", err);
                if (!res.headersSent) {
                    res.status(500).send("Error downloading file.");
                }
            }
        });
    } catch (error) {
        console.error("Directory read error:", error);
        res.status(500).json({ error: "Internal server error accessing storage." });
    }
});

// 4. OTA Manifest & Debug Routes
router.get('/manifest', apkUpdateController.getManifest);
router.get('/debug-ota', apkUpdateController.debugOta);

module.exports = router;