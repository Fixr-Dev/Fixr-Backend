const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Utility Imports
const connectDB = require('./utils/db.js');
const authRoutes = require('./routes/authRoutes.js');

// Initialization
dotenv.config();
const app = express();
const PORT = process.env.PORT || 1000;
const updatesFolder = path.join(__dirname, 'updates');

// Connect to Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Request Logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${new Date().toLocaleTimeString()}`);
  next();
});

// --- ROUTES ---

app.use('/api/auth', authRoutes);

app.get('/api/hello', (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend is live and routes are registered!",
  });
});

// Optimized Static Serving for Updates (Prevents Caching Issues)
app.use('/updates', express.static(updatesFolder, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Expires', '0');
  }
}));

/**
 * EXPO MANIFEST ENDPOINT
 * This is the heart of the OTA system.
 */
app.get('/api/manifest', (req, res) => {
  try {
    const bundlePath = path.join(updatesFolder, 'index.android.bundle');
    if (!fs.existsSync(bundlePath)) return res.status(404).json({ error: "No bundle" });

    const fileBuffer = fs.readFileSync(bundlePath);
    
    // 1. Generate the hash
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); 

    // 2. Generate a STABLE but UNIQUE ID for this specific file content
    const fileContentHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const stableId = `${fileContentHash.slice(0,8)}-${fileContentHash.slice(8,12)}-4${fileContentHash.slice(12,15)}-a${fileContentHash.slice(16,19)}-${fileContentHash.slice(20,32)}`;

    // 3. Get the ACTUAL file modification time so the app knows it's "newer"
    const stats = fs.statSync(bundlePath);
    const fileTimestamp = stats.mtime.toISOString();

    // HEADERS (Keep exactly as your working version)
    // 1. Force the browser/app to NEVER cache this JSON
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    // 2. Expo Specific Headers
    res.setHeader('expo-protocol-version', '0');
    res.setHeader('expo-sfv-version', '0');
    res.setHeader('content-type', 'application/json');
    
    // 3. CRITICAL: Remove the ETag
    // Without this, the server sends a "fingerprint" and the app 
    // sends it back, resulting in a 304 if the file hasn't changed 
    // in a way the server's default logic understands.
    res.removeHeader('ETag');

    // 4. Ngrok bypass (highly recommended since you are using ngrok)
    res.setHeader('ngrok-skip-browser-warning', 'true');

    res.json({
      id: stableId, // The ID changes only if the file changes
      createdAt: fileTimestamp, // The timestamp reflects when the file was last updated
      runtimeVersion: req.headers['expo-runtime-version'] || "1.0.0",
      launchAsset: {
        hash: hash,
        key: "bundle",
        contentType: "application/javascript",
        url: `https://${req.get('host')}/updates/index.android.bundle`
      },
      assets: [],
      metadata: {}
    });

    console.log(`✅ Manifest [${stableId}] sent at ${fileTimestamp}`);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Error" });
  }
});

// Debug Route
app.get('/api/debug-ota', (req, res) => {
  res.json({
    searchingIn: updatesFolder,
    bundleExists: fs.existsSync(path.join(updatesFolder, 'index.android.bundle')),
    files: fs.existsSync(updatesFolder) ? fs.readdirSync(updatesFolder) : "Folder missing"
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});