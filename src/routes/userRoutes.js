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
  generateUniqueUserId,
  normalizeEmail,
  isValidEmail,
} from "../Helper/helper.js";
import { authendicate } from "../middleware/middleware.js";
import {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  InternalServerError,
  ConflictError,
  SuccessResponse,
  sendResponse,
} from "../../response.js";
import {
  generateCode,
  sendVerificationEmail,
  saveVerification,
  verifyCode,
  OTP_PURPOSE
} from "../Helper/verificationServices.js";
import { Verification } from "../models/verificationModels.js";
import { TodolistSchema } from "../models/todolistModels.js";

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ dest: "temp/" });
// ========================================================================
// User Register
// ========================================================================

router.post(
  "/api/userRegister",
  upload.single("profile"),
  async (req, res, next) => {
    let uploadedFilePath = req.file?.path;

    try {
      console.log("========== USER REGISTRATION STARTED ==========");

      const {
        userName,
        email,
        password,
        confirmPassword,
      } = req.body;

      console.log("STEP 1: Validating user details");

      const normalizedEmail = normalizeEmail(email);

      if (!isValidEmail(normalizedEmail)) {
        throw new BadRequestError("Invalid email address");
      }

      if (!userName?.trim()) {
        throw new BadRequestError("Username is required");
      }

      if (!password || password.length < 6) {
        throw new BadRequestError("Password must contain at least 6 characters");
      }

      if (password !== confirmPassword) {
        throw new BadRequestError(
          "Password and confirm password do not match."
        );
      }

      console.log("STEP 2: Checking existing user");

      const existingUser = await UserLoginCredentials.findOne({
        email: normalizedEmail,
      });

      if (existingUser) {
        throw new ConflictError("This email is already registered.");
      }

      console.log("STEP 3: Generating unique user ID");

      const userId = await generateUniqueUserId();

      console.log("STEP 4: Processing profile image");

      let profilePicUrl = null;

      if (req.file) {
        console.log("Uploading image to Cloudinary");

        const result = await cloudinary.uploader.upload(
          uploadedFilePath,
          {
            resource_type: "image",
            folder: `ProfilePicture/Individual/${userName}-${userId}`,
            public_id: `${userName}.${userId}_profilePic`,
          }
        );

        profilePicUrl = result.secure_url;

        console.log("Cloudinary upload successful");
      }

      console.log("STEP 5: Hashing password");

      const hashedPassword = await bcrypt.hash(password, 10);

      const userData = {
        userId,
        userName: userName.trim(),
        password: hashedPassword,
        profilePicUrl,
      };

      console.log("STEP 6: Generating OTP");

      const code = generateCode();

      console.log("STEP 7: Saving OTP in MongoDB");

      await saveVerification(
        normalizedEmail,
        code,
        userData,
        OTP_PURPOSE.REGISTRATION
      );

      console.log("OTP saved successfully");

      console.log("STEP 8: Sending OTP email");

      await sendVerificationEmail(normalizedEmail, code);

      console.log("OTP email sent successfully");

      console.log("STEP 9: Sending API response");

      return sendResponse(
        res,
        new SuccessResponse(
          "OTP sent successfully. Verify email to complete registration."
        ),
        201
      );

    } catch (error) {
      console.error("REGISTRATION ERROR:", error.message);

      next(error);

    } finally {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        try {
          await fs.promises.unlink(uploadedFilePath);
          console.log("Temporary profile image cleaned up");
        } catch (cleanupError) {
          console.error(
            "Temporary file cleanup failed:",
            cleanupError.message
          );
        }
      }

      console.log("========== REGISTRATION PROCESS ENDED ==========");
    }
  }
);


// ========================================================================
// User Mail id OTP Verification - Registration/ForgotPassword
// ========================================================================
router.post("/api/verifyEmail", async (req, res, next) => {
  try {
    const { email, code ,purpose} = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      throw new BadRequestError("Invalid email address");
    }
    const result = await verifyCode(normalizedEmail, code,purpose); // from verificationService.js

    sendResponse(
      res,
      new SuccessResponse("Email verified successfully", { data: result }),
      201,
    );
  } catch (error) {
    next(error);
  }
});

// ========================================================================
// User Login / Logout
// ========================================================================
router.post("/api/userLoginOrLogout", async (req, res, next) => {
  try {
    const { type, email, password } = req.body;
    console.log(type, email, password);
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      throw new BadRequestError("Invalid email address");
    }
    const isUser = await UserLoginCredentials.findOne({
      email: normalizedEmail,
    });
    if (!isUser) {
      throw new NotFoundError(
        "Couldn't find any user using this email. Enter a valid mail..",
      );
    } else if (type === "login") {
      const unHashPassword = await bcrypt.compare(password, isUser.password);
      if (unHashPassword === true) {
        isUser.isLoggedin = true;
        await isUser.save();
        const data = {
          userId: isUser.userId,
        };
        const token = await generateToken(data);
        sendResponse(
          res,
          new SuccessResponse("User loggedin successfully..", {
            userId: isUser.userId,
            token: token,
          }),
          200,
        );
      } else throw new BadRequestError("Please enter the correct details..");
    } else if (type === "logout") {
      isUser.isLoggedin = false;
      await isUser.save();
      sendResponse(
        res,
        new SuccessResponse("User loggedout successfully..", {
          userId: isUser.userId,
        }),
        200,
      );
    } else {
      throw new BadRequestError(
        "Please enter the valid type value. Type must be login or logout..",
      );
    }
  } catch (error) {
    next(error);
  }
});

// ========================================================================
// Get User
// ========================================================================
router.post("/api/getUser", async (req, res, next) => {
  try {
    const { userId } = req.body;
    const findUserData = await UserLoginCredentials.findOne({ userId: userId });
    if (!findUserData) {
      throw new NotFoundError("User not found..");
    }
    sendResponse(
      res,
      new SuccessResponse("User loggedin successfully..", {
        data: findUserData,
      }),
      200,
    );
  } catch (error) {
    next(error);
  }
});

// ========================================================================
// Update User
// ========================================================================
router.post("/api/updateUserDetails",
  authendicate,
  upload.single("file"),
  async (req, res, next) => {
    try {
      const token = req.header("Authorization");
      if (!token) {
        throw new UnauthorizedError("Token required..");
      }
      const userId = await getUserIdFromToken(token);
      const updates = req.body;

      const findUserData = await UserLoginCredentials.findOne({
        userId: userId,
      });
      if (!findUserData) {
        throw new NotFoundError("Can't find user details..");
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
        { returnDocument: "after" },
      );
      if (!updateUserDetails) {
        throw new BadRequestError("Can't update user details..");
      }
      sendResponse(
        res,
        new SuccessResponse("User details successfully updated..", {
          data: updateUserDetails,
        }),
        200,
      );
    } catch (error) {
      next(error);
    }
  },
);

// ========================================================================
// Send FCM Token To Backend
// ========================================================================
router.post( "/api/sendFcmTokenToBackend",
  authendicate,
  async (req, res, next) => {
    try {
      const { token } = req.body;
      const loginToken = req.header("Authorization");
      const userData = await getUserDataFromToken(loginToken);
      if (!token || !loginToken) {
        throw new UnauthorizedError("Token is missing..");
      }
      const updateToken = await UserLoginCredentials.findOneAndUpdate(
        { userId: userData.userId },
        { $set: { fcmToken: token } },
      );
      if (updateToken) {
        sendResponse(
          res,
          new SuccessResponse("Token stored successfully..", {
            data: updateToken,
          }),
          200,
        );
      }
      throw new InternalServerError("Error occurred while storing token..");
    } catch (error) {
      next(error);
    }
  },
);

// ========================================================================
// Request Password Reset
// ========================================================================
router.post("/api/forgotPassword", async (req, res, next) => {
  try {
    const { email, purpose } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      throw new BadRequestError("Invalid email address");
    }
    const user = await UserLoginCredentials.findOne({ email : normalizedEmail });

    if (!user) {
      throw new BadRequestError("No account found with this email.");
    }

    const code = generateCode();

    await saveVerification(normalizedEmail, code,null,OTP_PURPOSE.FORGOT_PASSWORD);

    await sendVerificationEmail(normalizedEmail, code);

    sendResponse(
      res,
      new SuccessResponse("OTP sent successfully to your email."),
      200,
    );
  } catch (error) {
    next(error);
  }
});

// ========================================================================
// Reset Password
// ========================================================================
router.post("/api/resetPassword", async (req, res, next) => {
  try {
    const { email, password, confirmPassword } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      throw new BadRequestError("Invalid email address");
    }
    if (password !== confirmPassword) {
      throw new BadRequestError("Password and confirm password do not match.");
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    await UserLoginCredentials.updateOne(
      {email :  normalizedEmail },
      { $set: { password: hashedPassword } },
    );
    await Verification.deleteMany({ email : normalizedEmail });

    sendResponse(res, new SuccessResponse("Password reset successfully."), 200);
  } catch (error) {
    next(error);
  }
});

router.post("/api/resendOtp", async (req, res, next) => {
  try {
    const { email, purpose } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      throw new BadRequestError("Invalid email address");
    }
    const verification = await Verification.findOne({ email : normalizedEmail,purpose });

    if (!verification) {
      throw new BadRequestError("No OTP request found");
    }

    // 60 seconds cooldown
    const now = new Date();

    if (
      verification.lastSentAt &&
      now.getTime() - verification.lastSentAt.getTime() < 60000
    ) {
      throw new BadRequestError(
        "Please wait 60 seconds before requesting another OTP",
      );
    }

    // Maximum 5 resends
    if (verification.resendCount >= 5) {
      throw new BadRequestError("Maximum OTP resend attempts reached");
    }

    const newOtp = generateCode();
    const hashedOtp = await bcrypt.hash(newOtp, 10);

    verification.code = hashedOtp;
    verification.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    verification.lastSentAt = now;
    verification.resendCount += 1;

    await verification.save();

    await sendVerificationEmail(normalizedEmail, newOtp);

    sendResponse(res, new SuccessResponse("OTP resent successfully"), 200);
  } catch (error) {
    next(error);
  }
});

// =========================================================================
// Delete User Account
// =========================================================================
router.delete("/api/deleteAccount", authendicate, async (req, res) => {
  try {
    const token = req.header("Authorization");
    const userId = await getUserIdFromToken(token);

    // Delete all user todos
    await TodolistSchema.deleteMany({ userId });

    // Delete user account
    const deletedUser = await UserLoginCredentials.findOneAndDelete({ userId });

    if (!deletedUser) {
      throw new NotFoundError("Can't find user details..");
    }

    return res.status(200).json({
      success: true,
      message: "Account deleted successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
export default router;
