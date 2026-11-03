import express from "express";
import admin from "../Helper/fcm.js";
import { authendicate } from "../middleware/middleware.js";
import { getUserIdFromToken } from "../Helper/helper.js";
import { NotFoundError } from "../../response.js";

const router = express.Router();

router.post("/api/sentNotification", authendicate, async (req, res,next) => {
  try {
    const { title, body } = req.body;
    const token = req.header("Authorization");
        if (!token) {
                 throw new UnauthorizedError("Token required..");
               }
         const userId = await getUserIdFromToken(token);
            if (!userId) {
           throw new NotFoundError("Can't find user details..");
         }
    if (!userId?.fcmToken) {
      throw new NotFoundError("No FCM token found for user")
    }
    const message = {
      notification: {
        title: title,
        body: body,
      },
      token: userId.fcmToken,
    };
    const response = await admin.messaging().send(message);
     sendResponse(
        res,
        new SuccessResponse("Notification sent successfully..", {
          data: response,
        }),
        200,
      );

  } catch (error) {
   next(error);
  }
});

export default router;
