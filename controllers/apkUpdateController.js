const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const updatesFolder = path.join(process.cwd(), '..', 'updates');

exports.getManifest = (req, res) => {
    console.log("Files in Updates Folder:", fs.readdirSync(updatesFolder))
    try {
        const bundlePath = path.join(updatesFolder, 'index.android.bundle');
        const versionPath = path.join(updatesFolder, 'version.json'); // --- ADDED: Path to version file ---
        
        if (!fs.existsSync(bundlePath)) {
            return res.status(404).json({ 
                error: "No bundle found",
                attemptedPath: bundlePath 
            });
        }

        // --- START: VERSION LOGIC ---
        let currentVersion = "1.0.0"; // Fallback
        if (fs.existsSync(versionPath)) {
        try {
            const rawData = fs.readFileSync(versionPath, 'utf8').trim();
            // Remove potential BOM characters if they still exist
            const cleanData = rawData.replace(/^\uFEFF/, ''); 
            
            const versionData = JSON.parse(cleanData);
            currentVersion = versionData.version;
            console.log(`✅ Version identified: ${currentVersion}`);
            } catch (e) {
            console.error("❌ JSON Parse Error:", e.message);
            console.log("📝 Raw File Content was:", fs.readFileSync(versionPath, 'utf8'));
            }
        } else {
            console.error("❌ version.json is MISSING from", versionPath);
        }
        // --- END: VERSION LOGIC ---

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
        const versionArray = currentVersion?.split('.');

        // Headers
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('expo-protocol-version', '1'); // --- UPDATED: Use '1' for SDK 54 ---
        res.setHeader('expo-sfv-version', '0');
        res.setHeader('content-type', 'application/json');
        res.setHeader('ngrok-skip-browser-warning', 'true');
        res.removeHeader('ETag');

        // Note: Using res.json() works fine here since you aren't strictly 
        // enforcing RSA signing yet. If you use RSA, change this to res.send(JSON.stringify(data))
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
                    version: currentVersion, // --- UPDATED: Now dynamic ---
                    runtimeVersion: `runtime-${versionArray[0]}`,
                    sdkVersion: "54.0.0"
                }
            }
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