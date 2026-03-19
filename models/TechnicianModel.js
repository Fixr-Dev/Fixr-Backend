const mongoose = require("mongoose");

const technicianSchema = new mongoose.Schema({
  // THE BRIDGE: Connects this profile to the common UserModal
  userId: {
    type: String,
    ref: 'User',
    required: true,
    unique: true // One technician profile per user
  },
  
  // CATEGORIZATION
  category: { 
    type: String, 
    required: true, 
    index: true // Faster searching for "Electricians"
  },
  profession: { type: String, required: true },
  skills: { type: [String], default: [] },
  
  // EXPERIENCE & BIO
  experience_years: { type: Number, default: 0 },
  experience_type: { type: String }, // e.g., Residential, Industrial
  about: { type: String, trim: true },
  
  // PRICING
  starting_price: { type: Number, required: true },
  price_unit: { type: String, default: "per visit" }, // e.g., per hour, per job
  
  // SERVICE RADIUS (Works with UserModal's Location)
  service_radius_km: { type: Number, default: 10 },
  
  // AVAILABILITY LOGIC
  availability: {
    working_days: { 
        type: [String], 
        default: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] 
    },
    working_hours: {
      start: { type: String, default: "09:00" },
      end: { type: String, default: "18:00" }
    }
  },
  emergency_available: { type: Boolean, default: false },
  response_time_minutes: { type: Number, default: 30 },
  
  // TRUST & VERIFICATION
  is_verified: { type: Boolean, default: false },
  verification_badges: { type: [String], default: [] },
  response_badge: { type: String },
  reliability_score: { type: Number, default: 100 }, // Out of 100
  
  // RATINGS (Suggested Addition)
  averageRating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },

  // MEDIA (Stored in your MinIO)
  images: { type: [String], default: [] },
  videos: { type: [String], default: [] },
  
  // ANALYTICS & VISIBILITY
  contact_clicks: { type: Number, default: 0 },
  profile_views: { type: Number, default: 0 },
  is_featured: { type: Boolean, default: false },
  is_active: { type: Boolean, default: true }
}, { 
  timestamps: true 
});

// Index for category and price filtering
technicianSchema.index({ category: 1, starting_price: 1 });

const Technician = mongoose.model("Technician", technicianSchema);
module.exports = Technician;