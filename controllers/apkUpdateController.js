const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const updatesFolder = path.join(process.cwd(),'..', 'updates');



exports.getManifest = (req, res) => {
    try {
        const bundlePath = path.join(updatesFolder, 'index.android.bundle');
        if (!fs.existsSync(bundlePath)) return res.status(404).json({ error: "No bundle found" });

        const fileBuffer = fs.readFileSync(bundlePath);
        const stats = fs.statSync(bundlePath);

        // 1. Generate the SHA-256 Hash (Required for integrity)
        const hash = crypto.createHash('sha256')
            .update(fileBuffer)
            .digest('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); 

        // 2. Generate a TRULY Unique Update ID 
        // We use the file mtime + size to ensure that if the file changes, the ID changes.
        const updateIdentifier = crypto.createHash('md5')
            .update(fileBuffer)
            .update(stats.mtime.toString()) 
            .digest('hex');

        res.json({
            id: updateIdentifier, // Changed to be strictly tied to this specific file version
            createdAt: stats.mtime.toISOString(), 
            runtimeVersion: req.headers['expo-runtime-version'] || "1.0.0",
            launchAsset: {
                hash: hash,
                key: `bundle-${updateIdentifier.slice(0, 8)}`, // UNIQUE KEY per version
                contentType: "application/javascript",
                url: `${req.protocol}://${req.get('host')}/api/updates/index.android.bundle?v=${updateIdentifier}` // Cache busting URL
            },
            assets: [],
            metadata: { 
                branchName: "main", 
                bundleUpdateId: updateIdentifier 
            }
        });

    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
};
exports.debugOta = (req, res) => {
    res.json({
        searchingIn: updatesFolder,
        bundleExists: fs.existsSync(path.join(updatesFolder, 'index.android.bundle')),
        files: fs.existsSync(updatesFolder) ? fs.readdirSync(updatesFolder) : "Folder missing"
    });
};