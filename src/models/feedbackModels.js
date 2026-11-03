import mongoose from "mongoose";

const FeedbackSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  message: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5 }, // optional star rating
  createdAt: { type: Date, default: Date.now },
});

export const Feedback = mongoose.model("Feedback", FeedbackSchema);
