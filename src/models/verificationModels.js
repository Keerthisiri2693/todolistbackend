import mongoose from "mongoose";

const verificationSchema = new mongoose.Schema({
  email: { type: String, required: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true },
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
});

export const Verification = mongoose.model("Verification", verificationSchema,"Verification");
