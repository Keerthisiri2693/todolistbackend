import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import { getFolderByMimeType, getUserIdFromToken } from "../Helper/helper.js";
import { authendicate } from "../middleware/middleware.js";
import { UserLoginCredentials } from "../models/loginModels.js";
import { BadRequestError, InternalServerError, NotFoundError, UnauthorizedError } from "../../response.js";

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ dest: "temp/" });

router.post("/api/uploadProfilePicture",authendicate,upload.single("file"),
  async (req, res,next) => {
    try {
      const { groupId, type } = req.body;
      const token = req.header("Authorization");
         if (!token) {
                       throw new UnauthorizedError("Token required..");
                     }
               const userId = await getUserIdFromToken(token);
                  if (!userId) {
                 throw new NotFoundError("Can't find user details..");
               }
      const userData = await UserLoginCredentials.findOne({ userId: userId });

      if (!req.file || !token) {
        throw new BadRequestError("Required files missing..")
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
        throw new InternalServerError("Error occurred while changing or updating profile picture..")
      
      } else {
        userData.profilePicUrl = result.secure_url;
        await userData
          .save()
          .then(() => {
              sendResponse(
        res,
        new SuccessResponse("Profile picture updated successfully..", {
          data: {}
        }),
        200,
      );
          })
          .catch((error) => {
            next(error)
            // return res
            //   .status(400)
            //   .json({ success: false, error: error.message });
          });
      }
    } catch (error) {
     next(error);
    }
  },
);

export default router;
