const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3"); 
const connectDB = require('./utils/db.js');
const authRoutes = require('./routes/authRoutes.js');
const locationRoutes = require('./routes/locationRoutes.js');
const apkUpdateRoutes = require('./routes/apkUpdateRoutes.js');
const { default: mongoose } = require('mongoose');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

// --- FILEBASE S3 SDK CONFIGURATION (For Serving/Viewing Media) ---
const s3Client = new S3Client({
  region: "us-east-1", // Filebase expects us-east-1
  endpoint: "https://s3.filebase.com", 
  credentials: {
    accessKeyId: process.env.FILEBASE_ACCESS_KEY,
    secretAccessKey: process.env.FILEBASE_SECRET_KEY,
  },
  forcePathStyle: true, // Crucial for Filebase compatibility
});

// Middleware
app.use(cors());
app.use(express.json());

// Request Logger
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toLocaleTimeString()}`);
    next();
});

// --- SERVERLESS DATABASE CONNECTION MIDDLEWARE ---
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error("❌ Database connection middleware failed:", err.message);
        res.status(500).json({ success: false, message: "Database connection failure" });
    }
});

// --- ROUTES ---
app.use('/auth', authRoutes);
app.use('/apk', apkUpdateRoutes);
app.use('/location', locationRoutes);

// --- MEDIA PROXY ROUTE (Serving Files directly from Filebase) ---
app.get('/media/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const bucketName = process.env.FILEBASE_BUCKET;
        const fileKey = filename;

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: fileKey,
        });

        const response = await s3Client.send(command);

        // Set content headers from metadata and pipe file payload down to the client
        res.setHeader('Content-Type', response.ContentType || 'image/png');
        response.Body.pipe(res);

    } catch (error) {
        console.error("❌ Filebase View Error:", error.message);
        res.status(404).send("File not found on FIXR cloud storage");
    }
});

app.get('/hello', (req, res) => {
    res.status(200).json({ success: true, message: "Fixr Backend Live" });
});

// --- WARNING: DELETE THIS AFTER DEBUGGING ---
app.get('/api/debug-db', (req, res) => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  const connectionState = states[mongoose.connection.readyState] || 'unknown';

  res.status(200).json({
    mongooseState: connectionState,
    rawReadyState: mongoose.connection.readyState,
    envMongoUri: process.env.MONGO_URI ? "Found (Hidden for safety)" : "❌ NOT FOUND",
    nodeEnv: process.env.NODE_ENV || "not set",
    timestamp: new Date().toISOString()
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: err.message });
});

// Start Server
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Production Server running on port ${PORT}`);
    try {
        await connectDB();
    } catch (err) {
        console.error("Initial connection attempt failed:", err.message);
    }
    
    console.log(`✅ Filebase S3 Client initialized on route /media/`);
});