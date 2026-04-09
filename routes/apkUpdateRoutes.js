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
        // Read the directory to find the latest APK file
        const files = fs.readdirSync(apkFolder);
        const apkFiles = files
            .filter(file => file.endsWith('.apk'))
            .map(name => ({ 
                name, 
                time: fs.statSync(path.join(apkFolder, name)).mtime.getTime() 
            }))
            .sort((a, b) => b.time - a.time);

        const apkFile = apkFiles[0]?.name;

        if (!apkFile) {
            return res.status(404).json({ error: "No .apk file found in the storage folder." });
        }

        const filePath = path.join(apkFolder, apkFile);

        // --- NGROK BYPASS ---
        // This is the key header. We set it before anything else.
        res.setHeader('ngrok-skip-browser-warning', 'true');
        
        // Optional: Ensure the browser knows it's an Android app
        res.setHeader('Content-Type', 'application/vnd.android.package-archive');

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