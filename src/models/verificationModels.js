
import mongoose from "mongoose";

const verificationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    code: {
      type: String,
      required: true,
    },

    // OTP purpose
    purpose: {
      type: String,
      enum: ["registration", "forgotPassword"],
      required: true,
    },

    // OTP expiry
    expiresAt: {
      type: Date,
      required: true,
    },

    // Resend tracking
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

    // Invalid OTP attempts
    attempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// One OTP per email and purpose
verificationSchema.index(
  { email: 1, purpose: 1 },
  { unique: true }
);

// Use your existing MongoDB collection name
export const Verification = mongoose.model(
  "Verification",
  verificationSchema,
  "Verification"
);
