import express from "express";
import { Feedback } from "../models/feedbackModels.js";
import { authendicate } from "../middleware/middleware.js";
import { getUserIdFromToken } from "../Helper/helper.js";
import { UserLoginCredentials } from "../models/loginModels.js";

const router = express.Router();

// POST: Submit feedback
router.post("/api/feedback", authendicate, async (req, res) => {
  try {
    const { message, rating } = req.body;
    const token = req.header("Authorization");
    const userId = await getUserIdFromToken(token);

    const feedback = new Feedback({ userId, message, rating });
    await feedback.save();

    return res
      .status(200)
      .json({ success: true, data: "Feedback sent successfully!", feedback });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



// GET: Fetch all feedback (admin only)
router.get("/api/fetchAllFeedback", authendicate, async (req, res) => {
  try {
    const feedbacks = await Feedback.find().lean();
    const enriched = await Promise.all(
      feedbacks.map(async (fb) => {
        const user = await UserLoginCredentials.findOne({
          userId: fb.userId,
        }).lean();
        return {
          ...fb,
          user: user ? { username: user.username, email: user.email } : null,
        };
      }),
    );
    return res.status(200).json({ success: true, feedbacks: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
