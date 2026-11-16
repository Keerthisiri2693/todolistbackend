
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

    purpose: {
      type: String,
      enum: ["registration", "forgotPassword"],
      default: "registration",
      required: true,
    },

    // Temporary registration details
    userData: {
      userId: String,
      userName: String,
      password: String,
      profilePicUrl: String,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    // OTP resend tracking
    resendCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    resendBlockedUntil: {
      type: Date,
      default: null,
    },

    lastSentAt: {
      type: Date,
      default: Date.now,
    },

    // OTP verification attempts
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    verified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// One OTP record per email and purpose
verificationSchema.index(
  { email: 1, purpose: 1 },
  { unique: true }
);

export const Verification = mongoose.model(
  "Verification",
  verificationSchema,
  "Verification"
);
