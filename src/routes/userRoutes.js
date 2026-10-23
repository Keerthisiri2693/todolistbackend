import express from "express";
import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import path from "path";
import fs from "fs";
import { UserLoginCredentials } from "../models/loginModels.js";

import {
  generateToken,
  getUserDataFromToken,
  getUserIdFromToken,
} from "../Helper/helper.js";
import { authendicate } from "../middleware/middleware.js";

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ dest: "temp/" });

router.post("/api/userRegister", upload.single("profile"), async (req, res) => {
  try {
    const { userId, userName, email, password, confirmPassword } = req.body;

    const isUserExcist = await UserLoginCredentials.findOne({
      userId: userId,
      email: email,
    });
    if (isUserExcist) {
      return res
        .status(400)
        .json({ success: false, error: "This email already registered.." });
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, error: "Passwords do not match." });
    }

    let profilePicUrl = null;

    if (req.file) {
      const filePath = req.file.path;
      const mimetype = req.file.mimetype;

      const originalNameWithExt = path.parse(req.file.originalname);

      const result = await cloudinary.uploader.upload(filePath, {
        resource_type: "image",
        folder: `ProfilePicture/Individual/${userName}-${userId}`,
        public_id: `${userName}.${userId}_profilePic`,
      });

      fs.unlinkSync(filePath);

      profilePicUrl = result.secure_url;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userStructure = new UserLoginCredentials({
      userId: userId,
      userName: userName,
      email: email,
      password: hashedPassword,
      fcmToken: null,
      isLoggedin: false,
      passwordForArchive: null,
      profilePicUrl: profilePicUrl,
    });
    await userStructure
      .save()
      .then(() => {
        return res
          .status(200)
          .json({ success: true, message: "User register successfully.." });
      })
      .catch((error) => {
        return res.status(400).json({ success: false, error: error.message });
      });
  } catch (error) {
    console.log(error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/api/userLoginOrLogout", async (req, res) => {
  try {
    const { type, email, password } = req.body;
    console.log(type, email, password);

    const isUser = await UserLoginCredentials.findOne({ email: email });
    if (!isUser) {
      return res
        .status(404)
        .json({
          success: false,
          error: "Couldn't find any user using this email. Enter a valid mail.",
        });
    } else if (type === "login") {
      const unHashPassword = await bcrypt.compare(password, isUser.password);
      if (unHashPassword === true) {
        isUser.isLoggedin = true;
        await isUser.save();
        const data = {
          userId: isUser.userId,
        };
        const token = generateToken(data);
        console.log("login token", token);

        return res
          .status(200)
          .json({
            success: true,
            message: "User loggedin successfully..",
            userId: isUser.userId,
            token: token,
          });
      }
      return res
        .status(404)
        .json({ success: false, error: "Please enter the correct details." });
    } else if (type === "logout") {
      isUser.isLoggedin = false;
      await isUser.save();
      return res
        .status(200)
        .json({
          success: true,
          message: "User loggedout successfully..",
          userId: isUser.userId,
        });
    } else {
      return res
        .status(400)
        .json({
          success: false,
          message: "Please enter the valid type value..",
        });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/api/getUser", async (req, res) => {
  try {
    const { userId } = req.body;
    const findUserData = await UserLoginCredentials.findOne({ userId: userId });
    if (!findUserData) {
      return res
        .status(404)
        .json({ success: false, error: "User not found..!!" });
    }
    return res.status(200).json({ success: true, data: findUserData });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/api/updateUserDetails",authendicate, upload.single("file"),async (req, res) => {
    try {
      const token = req.header("Authorization");
      if (!token) {
        return res
          .status(400)
          .json({ success: false, error: "Token required..!!" });
      }
      const userId = await getUserIdFromToken(token);
      const updates = req.body;

      const findUserData = await UserLoginCredentials.findOne({
        userId: userId,
      });
      if (!findUserData) {
        return res
          .status(404)
          .json({ success: false, error: "Can't find user details." });
      }

      if (req.file) {
        if (findUserData.profilePicUrl) {
          const publicId = findUserData.profilePicUrl
            .split("/")
            .slice(-1)[0]
            .split(".")[0];
          console.log(publicId);

          await cloudinary.uploader.destroy(
            `ProfilePicture/Individual/${findUserData.userName}-${findUserData.userId}/${publicId}`,
            { resource_type: "image" },
          );
        }

        const filePath = req.file.path;
        const result = await cloudinary.uploader.upload(filePath, {
          resource_type: "image",
          folder: `ProfilePicture/Individual/${findUserData.userName}-${findUserData.userId}`,
          public_id: `${findUserData.userName}-${findUserData.userId}_profilePic`,
        });

        fs.unlinkSync(filePath);

        updates.profilePicUrl = result.secure_url;
      }
      delete updates.file;
      delete updates.userId;

      const updateUserDetails = await UserLoginCredentials.findOneAndUpdate(
        { userId: userId },
        { $set: updates },
        { new: true },
      );
      if (!updateUserDetails) {
        return res
          .status(400)
          .json({ success: false, error: "Can't update user details." });
      }
      return res
        .status(200)
        .json({
          success: true,
          message: "User details successfully updated..!!",
        });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

router.post("/api/sendFcmTokenToBackend", authendicate, async (req, res) => {
  try {
    const { token } = req.body;
    const loginToken = req.header("Authorization");
    const userData = await getUserDataFromToken(loginToken);
    if (!token || !loginToken) {
      return res
        .status(404)
        .json({ success: false, error: "Token is missing..!!" });
    }
    const updateToken = await UserLoginCredentials.findOneAndUpdate(
      { userId: userData.userId },
      { $set: { fcmToken: token } },
    );
    if (updateToken) {
      return res
        .status(200)
        .json({ success: true, message: "Token stored successfully.." });
    }
    return res
      .status(400)
      .json({ success: false, error: "Error occured while storing token.." });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});



export default router;
