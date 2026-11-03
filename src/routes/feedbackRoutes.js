import express from "express";
import { Feedback } from "../models/feedbackModels.js";
import { authendicate } from "../middleware/middleware.js";
import { getUserIdFromToken } from "../Helper/helper.js";
import { UserLoginCredentials } from "../models/loginModels.js";

const router = express.Router();

// POST: Submit feedback
router.post("/api/feedback", authendicate, async (req, res,next) => {
  try {
    const { message, rating } = req.body;
    const token = req.header("Authorization");
       if (!token) {
                 throw new UnauthorizedError("Token required..");
               }
         const userId = await getUserIdFromToken(token);
            if (!userId) {
           throw new NotFoundError("Can't find user details..");
         }
    const feedback = new Feedback({ userId, message, rating });
    await feedback.save();
    sendResponse(
        res,
        new SuccessResponse("Feedback sent successfully..", {
          data: feedback,
        }),
        200,
      );
 
  } catch (error) {
    next(error)
  }
});

// GET: Fetch all feedback (admin only)
router.get("/api/fetchAllFeedback", authendicate, async (req, res,next) => {
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
      sendResponse(
        res,
        new SuccessResponse("Feedbacks..", {
          data: enriched,
        }),
        200,
      );
   
  } catch (error) {
   next(error)
  }
});

export default router;
