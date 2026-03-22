const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');

// Route to get all Indian States
router.get('/states', locationController.getIndianStates);

// Route to get cities for a specific state
router.get('/cities/:stateCode', locationController.getCitiesByState);

// Route to search for a city by name (useful for the mobile search bar)
router.get('/search-city', locationController.searchCities);

module.exports = router;