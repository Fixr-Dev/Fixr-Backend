const express = require('express');
const router = express.Router();
const path = require('path'); // Added path requirement
const apkUpdateController = require('../controllers/apkUpdateController');

// 1. Define the absolute path to your updates folder
// Since this file is in /routes, we go up one level to /backend/updates
const updatesFolder = path.join(__dirname, '../../updates');

// 2. Serve the static bundle file
// This makes index.android.bundle available at: your-tunnel-url/api/updates/index.android.bundle
router.use('/download', express.static(updatesFolder, {
    setHeaders: (res) => {
        // Critical for OTA: Prevents the phone from caching an old version of the bundle
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }
}));

// 3. OTA Manifest & Debug Routes
router.get('/manifest', apkUpdateController.getManifest);
router.get('/debug-ota', apkUpdateController.debugOta);

module.exports = router;