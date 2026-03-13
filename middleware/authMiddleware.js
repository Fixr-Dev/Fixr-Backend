const jwt = require("jsonwebtoken");
const User = require("../models/UserModel.js");

const protect = async (req, res, next) => {
  let token = req.headers.authorization?.split(" ")[1];

  if (!token) return res.status(401).json({ message: "Not authorized, no token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-otp");
    next();
  } catch (error) {
    res.status(401).json({ message: "Token failed" });
  }
};

module.exports = { protect };

//