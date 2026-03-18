const fs = require('fs');
const path = require('path');

const target = 'D:/FixrServer/public/updates';

if (fs.existsSync(target)) {
    console.log("✅ Folder found!");
    console.log("Files inside:", fs.readdirSync(target));
} else {
    console.log("❌ Folder NOT found at:", target);
    // Check if D: drive is even visible
    try {
        console.log("Available on D: root:", fs.readdirSync('D:/'));
    } catch (e) {
        console.log("❌ Cannot even read D: drive root.");
    }
}