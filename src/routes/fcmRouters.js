import express from "express";
import admin from "../Helper/fcm.js";
import { authendicate } from "../middleware/middleware.js";
import { getUserIdFromToken } from "../Helper/helper.js";

const router = express.Router();

router.post("/api/sentNotification", authendicate, async (req, res) => {
  try {
    const { title, body } = req.body;
    const token = req.header("Authorization");
    const userId = await getUserIdFromToken(token);
    if (!userId?.fcmToken) {
      return res
        .status(404)
        .json({ success: false, error: "No FCM token found for user" });
    }
    const message = {
      notification: {
        title: title,
        body: body,
      },
      token: userId.fcmToken,
    };
    const response = await admin.messaging().send(message);
    return res
      .status(200)
      .json({
        success: true,
        message: "Notification send successfully..!!",
        response: response,
      });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
