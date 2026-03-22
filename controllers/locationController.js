// controllers/locationController.js
const { City, State } = require('country-state-city');

// Get all Indian States
exports.getIndianStates = (req, res) => {
  const states = State.getStatesOfCountry('IN');
  res.status(200).json(states);
};

// Get Cities by State Code (e.g., 'DL' for Delhi, 'MH' for Maharashtra)
exports.getCitiesByState = (req, res) => {
  const { stateCode } = req.params;
  const cities = City.getCitiesOfState('IN', stateCode);
  res.status(200).json(cities);
};

// Search all Indian cities (Caution: IN has 5,000+ cities)
exports.searchCities = (req, res) => {
  const { query } = req.query;
  const allCities = City.getAllCities().filter(city => 
    city.countryCode === 'IN' && 
    city.name.toLowerCase().includes(query.toLowerCase())
  );
  res.status(200).json(allCities.slice(0, 20)); // Limit for performance
};