const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const Minio = require('minio');

// Utility/Route Imports
const connectDB = require('./utils/db.js');
const authRoutes = require('./routes/authRoutes.js');
const apkUpdateRoutes = require('./routes/apkUpdateRoutes.js');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || "http://localhost";
const updatesFolder = path.join(__dirname, 'updates');

// --- MINIO CONFIGURATION ---
const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
});

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
app.use('/api', apkUpdateRoutes); // Registers /api/manifest and /api/debug-ota

// Optimized Static Serving for Updates
app.use('/updates', express.static(updatesFolder, {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
}));

app.get('/api/hello', (req, res) => {
    res.status(200).json({ success: true, message: "Fixr Backend Live" });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: err.message });
});

// Start Server and check connections
app.listen(PORT, BASE_URL, async () => {
    console.log(`🚀 Server running on ${BASE_URL}:${PORT}`);
    
    // 1. Connect MongoDB
    await connectDB();

    // 2. Check MinIO Connection
    minioClient.listBuckets((err, buckets) => {
        if (err) {
            console.error("❌ MinIO Connection Error:", err.message);
        } else {
            console.log(`✅ MinIO Connected. Found ${buckets.length} buckets.`);
        }
    });
});