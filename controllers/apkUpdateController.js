const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const updatesFolder = path.join(process.cwd(),'..', 'updates');



exports.getManifest = (req, res) => {
    try {
        const bundlePath = path.join(updatesFolder, 'index.android.bundle');
        console.log("Checking for bundle at:", bundlePath);
        
        if (!fs.existsSync(bundlePath)) {
        return res.status(404).json({ 
            error: "No bundle found",
            attemptedPath: bundlePath // Useful for one-time debugging
        });
    }

        const fileBuffer = fs.readFileSync(bundlePath);
        
        // Generate Expo-compliant Hash
        const hash = crypto.createHash('sha256')
            .update(fileBuffer)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, ''); 

        // Generate Stable ID
        const fileContentHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        const stableId = `${fileContentHash.slice(0, 8)}-${fileContentHash.slice(8, 12)}-4${fileContentHash.slice(12, 15)}-a${fileContentHash.slice(16, 19)}-${fileContentHash.slice(20, 32)}`;

        const stats = fs.statSync(bundlePath);
        const fileTimestamp = stats.mtime.toISOString();

        // Headers to prevent caching and bypass ngrok warnings
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('expo-protocol-version', '0');
        res.setHeader('expo-sfv-version', '0');
        res.setHeader('content-type', 'application/json');
        res.setHeader('ngrok-skip-browser-warning', 'true');
        res.removeHeader('ETag');

        res.json({
            id: stableId,
            createdAt: fileTimestamp, 
            runtimeVersion: req.headers['expo-runtime-version'] || "1.0.0",
            launchAsset: {
                hash: hash,
                key: hash,
                contentType: "application/javascript",
                url: `${process.env.BASE_URL}/api/apk/updates/index.android.bundle`
            },
            assets: [],
            metadata: { 
                branchName: "main", 
                bundleUpdateId: stableId,
            },
            extra:{
                expoConfig:{
                    name: "Fixr",
                    slug: "fixr",
                    version: "1.0.x", // Your test value
                    runtimeVersion:"1.0.0",
                    sdkVersion: "54.0.0" // Matches your log
                }
            },
            isVerified:true
    });

    } catch (error) {
        console.error("Manifest Error:", error);
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