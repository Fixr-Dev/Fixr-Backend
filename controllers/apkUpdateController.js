const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const updatesFolder = path.join(process.cwd(),'..', 'updates');
const PRIVATE_KEY_PATH = path.join(__dirname, '../private-key.pem');


exports.getManifest = (req, res) => {
    try {
        console.log("--- New Manifest Request Received ---");
        
        const bundlePath = path.join(updatesFolder, 'index.android.bundle');
        
        if (!fs.existsSync(bundlePath)) {
            console.error("❌ Bundle NOT found at:", bundlePath);
            return res.status(404).json({ error: "No bundle found" });
        }

        const fileBuffer = fs.readFileSync(bundlePath);
        
        // Generate Expo-compliant Asset Hash
        const hash = crypto.createHash('sha256')
            .update(fileBuffer)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, ''); 

        // Generate Stable ID (UUID format)
        const fileContentHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        const stableId = `${fileContentHash.slice(0, 8)}-${fileContentHash.slice(8, 12)}-4${fileContentHash.slice(12, 15)}-a${fileContentHash.slice(16, 19)}-${fileContentHash.slice(20, 32)}`;

        const stats = fs.statSync(bundlePath);
        const fileTimestamp = stats.mtime.toISOString();

        // Define the Manifest Object
        const manifest = {
            id: stableId,
            createdAt: fileTimestamp, 
            runtimeVersion: "1.0.0",
            launchAsset: {
                hash: hash,
                key: hash,
                contentType: "application/javascript",
                url: `${process.env.BASE_URL}/api/apk/updates/index.android.bundle`
            },
            assets: [],
            metadata: { 
                branchName: "main"
            },
            extra: {
                expoConfig: {
                    name: "Fixr",
                    slug: "fixr",
                    version: "1.0.x", 
                    runtimeVersion: "1.0.0",
                    sdkVersion: "54.0.0"
                }
            }
        };

        const manifestString = JSON.stringify(manifest);
        console.log("📦 Generated Manifest Object (ID):", stableId);

        // --- SIGNING PROCESS ---
        let signature = "";
        console.log("🔑 Checking for Private Key at:", PRIVATE_KEY_PATH);
        
        if (fs.existsSync(PRIVATE_KEY_PATH)) {
            const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
            const sign = crypto.createSign('RSA-SHA256');
            sign.update(manifestString);
            
            signature = sign.sign(privateKey, 'base64');
            console.log("✅ Signature generated successfully.");
        } else {
            console.warn("⚠️ PRIVATE_KEY_PATH not found. Manifest will be UNSIGNED (isVerified: false).");
        }

        // --- SETTING HEADERS ---
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('expo-protocol-version', '1'); 
        res.setHeader('expo-sfv-version', '0');
        res.setHeader('content-type', 'application/json');
        res.setHeader('ngrok-skip-browser-warning', 'true');
        
        if (signature) {
            const signatureHeader = `sig="${signature}"; keyid="main"`;
            res.setHeader('expo-signature', signatureHeader);
            console.log("📧 Expo-Signature Header set.");
        }

        console.log("🚀 Sending manifest to client...");
        
        // Send the RAW string to ensure signature integrity
        res.send(manifestString);

    } catch (error) {
        console.error("💥 Manifest Controller Error:", error);
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