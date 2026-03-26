const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const updatesFolder = path.join(process.cwd(),'..', 'updates');
const PRIVATE_KEY_PATH = path.join(__dirname, '../private-key.pem');


exports.getManifest = (req, res) => {
    try {
        const bundlePath = path.join(updatesFolder, 'index.android.bundle');
        
        if (!fs.existsSync(bundlePath)) {
            return res.status(404).json({ error: "No bundle found" });
        }

        const fileBuffer = fs.readFileSync(bundlePath);
        
        // Generate Expo-compliant Asset Hash (SHA-256 Base64URL)
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

        // 2. Define the Manifest Object
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

        // 3. SIGN THE MANIFEST (The magic part)
        let signature = "";
        if (fs.existsSync(PRIVATE_KEY_PATH)) {
            const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
            const sign = crypto.createSign('RSA-SHA256');
            sign.update(manifestString);
            // Sign and format for the Expo-Signature header
            signature = sign.sign(privateKey, 'base64');
        }

        // 4. Set Headers
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('expo-protocol-version', '1'); // Protocol 1 for signing/extra
        res.setHeader('expo-sfv-version', '0');
        res.setHeader('content-type', 'application/json');
        res.setHeader('ngrok-skip-browser-warning', 'true');
        
        // Add the Signature Header (keyid must match what's in app.config.js)
        if (signature) {
            res.setHeader('expo-signature', `sig="${signature}"; keyid="main"`);
        }

        // 5. Send the RAW string (Important: do not re-stringify or it breaks the signature)
        res.send(manifestString);

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