import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import { getFolderByMimeType, getUserIdFromToken } from "../Helper/helper.js";
import { authendicate } from "../middleware/middleware.js";
import { UserLoginCredentials } from "../models/loginModels.js";

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ dest: "temp/" });

router.post("/api/uploadProfilePicture",authendicate,upload.single("file"),
  async (req, res) => {
    try {
      const { groupId, type } = req.body;
      const token = req.header("Authorization");
      const userId = await getUserIdFromToken(token);
      const userData = await UserLoginCredentials.findOne({ userId: userId });

      if (!req.file || !token) {
        return res
          .status(400)
          .json({ success: false, error: "Required files missing..!!" });
      }

      const groupData = groupId
        ? await groupSchema.findOne({ groupId: groupId })
        : null;
      const filePath = req.file.path;
      const mimetype = req.file.mimetype;
      const folder = getFolderByMimeType(mimetype);
      const originalNameWithExt = path.parse(req.file.originalname);

      const result = await cloudinary.uploader.upload(filePath, {
        resource_type: "image",
        folder:
          type === "Individual"
            ? `ProfilePicture/${type}/${userData.userName}-${userData.userId}`
            : `ProfilePicture/${type}/${groupData.name}-${groupId}`,
        public_id: `${userData.userName}.${originalNameWithExt.ext}`,
      });

      fs.unlinkSync(filePath);
      if (!result) {
        return res
          .status(400)
          .json({
            success: false,
            error: "Error occurred while changing or updating profile picture.",
          });
      } else {
        userData.profilePicUrl = result.secure_url;
        await userData
          .save()
          .then(() => {
            return res
              .status(200)
              .json({
                success: true,
                message: "Profile picture updated successfully..",
              });
          })
          .catch((error) => {
            return res
              .status(400)
              .json({ success: false, error: error.message });
          });
      }
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

export default router;
