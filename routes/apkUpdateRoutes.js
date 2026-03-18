const express = require('express');
const router = express.Router();
const apkUpdateController = require('../controllers/apkUpdateController');

router.get('/manifest', apkUpdateController.getManifest);
router.get('/debug-ota', apkUpdateController.debugOta);

module.exports = router;