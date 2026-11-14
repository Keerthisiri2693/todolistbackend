import mongoose from "mongoose";

const verificationSchema = new mongoose.Schema({
  email: { type: String,
    required: true,
    lowercase: true,
    trim: true, },
  code: { type: String, required: true },
  // Registration or forgot password
  purpose: {
    type: String,
    enum: ["registration", "forgotPassword"],
    default: "registration",
  },
    // Temporary registration details
  userData: {
    userId: String,
    userName: String,
    password: String,
    profilePicUrl: String,
  },

  expiresAt: { type: Date, required: true },
    resendCount: {
    type: Number,
    default: 0,
  },
  resendCount: {
    type: Number,
    default: 0,
  },
  resendBlockedUntil: {
    type: Date,
    default: null,
  },

  lastSentAt: {
    type: Date,
    default: Date.now,
  },
    attempts: {
    type: Number,
    default: 0,
  },
});

// One OTP per email and purpose
verificationSchema.index(
  { email: 1, purpose: 1 },
  { unique: true }
);

export const Verification = mongoose.model("Verification", verificationSchema,"Verification");
