const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const Minio = require('minio');
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3"); // Import both here
const connectDB = require('./utils/db.js');
const authRoutes = require('./routes/authRoutes.js');
const apkUpdateRoutes = require('./routes/apkUpdateRoutes.js');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

// --- MINIO CONFIGURATION (Legacy Client) ---
const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT, 
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
});

// --- S3 SDK CONFIGURATION (For Upload/View) ---
// Ensure MINIO_ENDPOINT in .env is "http://192.168.1.9:9000"
const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`, 
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY, // FIXED: Removed 'C' from SCECRET
  },
  forcePathStyle: true,
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
app.use('/api', apkUpdateRoutes);
app.use('/api/location', locationRoutes);

// Optimized Static Serving for Updates
const updatesFolder = path.join(__dirname, 'updates');
app.use('/updates', express.static(updatesFolder, {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
}));

// --- GLOBAL VIEW ROUTE ---
// Changed from 'router.get' to 'app.get'
app.get('/fixr-uploads/uploads/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const bucketName = 'fixr-uploads';
        const fileKey = `uploads/${filename}`;

        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: fileKey,
        });

        const response = await s3Client.send(command);

        // Set headers and pipe stream
        res.setHeader('Content-Type', response.ContentType || 'image/png');
        response.Body.pipe(res);

    } catch (error) {
        console.error("❌ View Error:", error.message);
        res.status(404).send("File not found on FIXR storage");
    }
});

app.get('/api/hello', (req, res) => {
    res.status(200).json({ success: true, message: "Fixr Backend Live" });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: err.message });
});

// Start Server
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 Production Server running on port ${PORT}`);
    await connectDB();

    minioClient.listBuckets((err, buckets) => {
        if (err) {
            console.error("❌ MinIO Connection Error:", err.message);
        } else {
            console.log(`✅ MinIO Connected. Found ${buckets.length} buckets.`);
        }
    });
});