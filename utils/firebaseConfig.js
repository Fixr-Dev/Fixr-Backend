// app/firebaseConfig.js
const { initializeApp } = require("firebase/app");
const { getAuth } = require("firebase/auth");

const firebaseConfig = {
  apiKey: "AIzaSyAkI72sq5OQpnkD36Fhd7tglv3uIm0inQo",
  authDomain: "fixr-a1fef.firebaseapp.com",
  projectId: "fixr-a1fef",
  storageBucket: "fixr-a1fef.firebasestorage.app",
  messagingSenderId: "317764574993",
  appId: "1:317764574993:web:8b54c4578f7489ef1e36b0",
  measurementId: "G-HBWV7VJ2YR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
