
import express from "express";
import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import fs from "fs";

import { UserLoginCredentials } from "../models/loginModels.js";
import { Verification } from "../models/verificationModels.js";

import {
  generateToken,
  getUserDataFromToken,
  getUserIdFromToken,
  generateUniqueUserId,
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
  verifyForgotPasswordCode,
} from "../Helper/verificationServices.js";

const router = express.Router();

// ======================================================
// CLOUDINARY CONFIGURATION
// ======================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ======================================================
// MULTER CONFIGURATION
// ======================================================

const upload = multer({
  dest: "temp/",
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new BadRequestError("Only image files are allowed."));
    }
    cb(null, true);
  },
});

// ======================================================
// HELPER: DELETE TEMPORARY FILE
// ======================================================

function deleteTempFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error("Temporary file cleanup error:", error.message);
    }
  }
}

// ======================================================
// USER REGISTRATION
// POST /api/userRegister
// ======================================================

router.post(
  "/api/userRegister",
  upload.single("profile"),
  async (req, res, next) => {
    const filePath = req.file?.path;

    try {
      const { userName, email, password, confirmPassword } = req.body;

      if (!userName || !email || !password || !confirmPassword) {
        throw new BadRequestError("All fields are required.");
      }

      if (password !== confirmPassword) {
        throw new BadRequestError(
          "Password and confirm password do not match."
        );
      }

      if (password.length < 8) {
        throw new BadRequestError(
          "Password must contain at least 8 characters."
        );
      }

      const normalizedEmail = email.trim().toLowerCase();

      const existingUser = await UserLoginCredentials.findOne({
        email: normalizedEmail,
      });

      if (existingUser) {
        throw new ConflictError("This email is already registered.");
      }

      const userId = await generateUniqueUserId();

      let profilePicUrl = null;

      if (req.file) {
        const result = await cloudinary.uploader.upload(filePath, {
          resource_type: "image",
          folder: `ProfilePicture/Individual/${userName}-${userId}`,
          public_id: `${userName}.${userId}_profilePic`,
        });

        profilePicUrl = result.secure_url;
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const userStructure = new UserLoginCredentials({
        userId,
        userName,
        email: normalizedEmail,
        password: hashedPassword,
        fcmToken: null,
        isLoggedin: false,
        isVerified: false,
        passwordForArchive: null,
        profilePicUrl,
      });

      await userStructure.save();

      // Generate registration OTP
      const code = generateCode();

      // Save hashed OTP
      await saveVerification(
        normalizedEmail,
        code,
        "registration"
      );

      // Send OTP using Gmail
      try {
        await sendVerificationEmail(normalizedEmail, code);
      } catch (emailError) {
        await Verification.deleteMany({
          email: normalizedEmail,
          purpose: "registration",
        });

        // Keep the unverified account so the user can request a resend.
        throw new InternalServerError(
          "Account created, but verification email could not be sent. Please try resending the OTP."
        );
      }

      sendResponse(
        res,
        new SuccessResponse(
          "Registration successful. Please verify your email.",
          {
            data: {
              userId: userStructure.userId,
              userName: userStructure.userName,
              email: userStructure.email,
              profilePicUrl: userStructure.profilePicUrl,
              isVerified: false,
            },
          }
        ),
        201
      );

    } catch (error) {
      next(error);
    } finally {
      deleteTempFile(filePath);
    }
  }
);

// ======================================================
// VERIFY REGISTRATION EMAIL
// POST /api/verifyEmail
// ======================================================

router.post("/api/verifyEmail", async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      throw new BadRequestError("Email and OTP are required.");
    }

    await verifyCode(
      email.trim().toLowerCase(),
      code,
      "registration"
    );

    sendResponse(
      res,
      new SuccessResponse("Email verified successfully."),
      200
    );

  } catch (error) {
    next(error);
  }
});

// ======================================================
// USER LOGIN / LOGOUT
// POST /api/userLoginOrLogout
// ======================================================

router.post("/api/userLoginOrLogout", async (req, res, next) => {
  try {
    const { type, email, password } = req.body;

    if (!email || !type) {
      throw new BadRequestError("Email and type are required.");
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await UserLoginCredentials.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      throw new NotFoundError(
        "Couldn't find any user using this email."
      );
    }

    if (type === "login") {
      if (!password) {
        throw new BadRequestError("Password is required.");
      }

      if (!user.isVerified) {
        throw new ForbiddenError(
          "Please verify your email before login."
        );
      }

      const passwordValid = await bcrypt.compare(
        password,
        user.password
      );

      if (!passwordValid) {
        throw new BadRequestError(
          "Please enter the correct password."
        );
      }

      user.isLoggedin = true;
      await user.save();

      const token = await generateToken({
        userId: user.userId,
      });

      return sendResponse(
        res,
        new SuccessResponse("User logged in successfully.", {
          userId: user.userId,
          token,
        }),
        200
      );
    }

    if (type === "logout") {
      user.isLoggedin = false;
      await user.save();

      return sendResponse(
        res,
        new SuccessResponse("User logged out successfully.", {
          userId: user.userId,
        }),
        200
      );
    }

    throw new BadRequestError(
      "Type must be login or logout."
    );

  } catch (error) {
    next(error);
  }
});

// ======================================================
// GET USER
// POST /api/getUser
// ======================================================

router.post("/api/getUser", async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      throw new BadRequestError("User ID is required.");
    }

    const findUserData = await UserLoginCredentials.findOne({
      userId,
    });

    if (!findUserData) {
      throw new NotFoundError("User not found.");
    }

    sendResponse(
      res,
      new SuccessResponse("User details retrieved successfully.", {
        data: findUserData,
      }),
      200
    );

  } catch (error) {
    next(error);
  }
});

// ======================================================
// UPDATE USER DETAILS
// POST /api/updateUserDetails
// ======================================================

router.post(
  "/api/updateUserDetails",
  authendicate,
  upload.single("file"),
  async (req, res, next) => {
    const filePath = req.file?.path;

    try {
      const token = req.header("Authorization");

      if (!token) {
        throw new UnauthorizedError("Token required.");
      }

      const userId = await getUserIdFromToken(token);

      const existingUser = await UserLoginCredentials.findOne({
        userId,
      });

      if (!existingUser) {
        throw new NotFoundError("Can't find user details.");
      }

      const updates = { ...req.body };

      // Prevent sensitive field modification
      delete updates.file;
      delete updates.userId;
      delete updates.email;
      delete updates.password;
      delete updates.isVerified;
      delete updates.isLoggedin;
      delete updates.fcmToken;
      delete updates.profilePicUrl;

      if (req.file) {
        const result = await cloudinary.uploader.upload(filePath, {
          resource_type: "image",
          folder: `ProfilePicture/Individual/${existingUser.userName}-${existingUser.userId}`,
          public_id: `${existingUser.userName}-${existingUser.userId}_profilePic`,
          overwrite: true,
          invalidate: true,
        });

        if (!result?.secure_url) {
          throw new InternalServerError(
            "Cloudinary image upload failed."
          );
        }

        updates.profilePicUrl = result.secure_url;
      }

      const updatedUser = await UserLoginCredentials.findOneAndUpdate(
        { userId },
        { $set: updates },
        {
          new: true,
          runValidators: true,
        }
      );

      if (!updatedUser) {
        throw new BadRequestError("Can't update user details.");
      }

      sendResponse(
        res,
        new SuccessResponse("User details successfully updated.", {
          data: updatedUser,
        }),
        200
      );

    } catch (error) {
      console.error("UPDATE USER DETAILS ERROR:", error);
      next(error);
    } finally {
      deleteTempFile(filePath);
    }
  }
);

// ======================================================
// SEND FCM TOKEN
// POST /api/sendFcmTokenToBackend
// ======================================================

router.post(
  "/api/sendFcmTokenToBackend",
  authendicate,
  async (req, res, next) => {
    try {
      const { token } = req.body;
      const loginToken = req.header("Authorization");

      if (!token || !loginToken) {
        throw new BadRequestError("FCM token is required.");
      }

      const userData = await getUserDataFromToken(loginToken);

      const updatedUser = await UserLoginCredentials.findOneAndUpdate(
        { userId: userData.userId },
        { $set: { fcmToken: token } },
        { new: true }
      );

      if (!updatedUser) {
        throw new InternalServerError(
          "Error occurred while storing FCM token."
        );
      }

      sendResponse(
        res,
        new SuccessResponse("FCM token stored successfully.", {
          data: updatedUser,
        }),
        200
      );

    } catch (error) {
      next(error);
    }
  }
);

// ======================================================
// FORGOT PASSWORD - REQUEST OTP
// POST /api/forgotPassword
// ======================================================

router.post("/api/forgotPassword", async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new BadRequestError("Email is required.");
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await UserLoginCredentials.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      throw new BadRequestError(
        "No account found with this email."
      );
    }

    const code = generateCode();

    await saveVerification(
      normalizedEmail,
      code,
      "forgotPassword"
    );

    await sendVerificationEmail(normalizedEmail, code);

    sendResponse(
      res,
      new SuccessResponse(
        "Password reset OTP sent successfully."
      ),
      200
    );

  } catch (error) {
    next(error);
  }
});

// ======================================================
// VERIFY FORGOT PASSWORD OTP
// POST /api/verifyForgotPasswordOtp
// ======================================================

router.post(
  "/api/verifyForgotPasswordOtp",
  async (req, res, next) => {
    try {
      const { email, otp } = req.body;

      if (!email || !otp) {
        throw new BadRequestError("Email and OTP are required.");
      }

      await verifyForgotPasswordCode(
        email.trim().toLowerCase(),
        otp
      );

      sendResponse(
        res,
        new SuccessResponse("OTP verified successfully."),
        200
      );

    } catch (error) {
      next(error);
    }
  }
);

// ======================================================
// RESET PASSWORD
// POST /api/resetPassword
// ======================================================

router.post("/api/resetPassword", async (req, res, next) => {
  try {
    const { email, otp, password, confirmPassword } = req.body;

    if (!email || !otp || !password || !confirmPassword) {
      throw new BadRequestError("All fields are required.");
    }

    if (password !== confirmPassword) {
      throw new BadRequestError(
        "Password and confirm password do not match."
      );
    }

    if (password.length < 8) {
      throw new BadRequestError(
        "Password must contain at least 8 characters."
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await UserLoginCredentials.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      throw new NotFoundError("User not found.");
    }

    // Validate OTP again before resetting password
    const record = await verifyForgotPasswordCode(
      normalizedEmail,
      otp
    );

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;
    await user.save();

    // OTP is single-use
    await Verification.deleteOne({
      _id: record._id,
    });

    sendResponse(
      res,
      new SuccessResponse("Password reset successfully."),
      200
    );

  } catch (error) {
    next(error);
  }
});

// ======================================================
// RESEND OTP
// POST /api/resendOtp
// ======================================================

router.post("/api/resendOtp", async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new BadRequestError("Email is required.");
    }

    const normalizedEmail = email.trim().toLowerCase();

    const verification = await Verification.findOne({
      email: normalizedEmail,
    });

    if (!verification) {
      throw new BadRequestError("No OTP request found.");
    }

    const now = new Date();

    // 60-second cooldown
    if (
      verification.lastSentAt &&
      now.getTime() - verification.lastSentAt.getTime() < 60000
    ) {
      throw new BadRequestError(
        "Please wait 60 seconds before requesting another OTP."
      );
    }

    // Maximum 5 resends
    if (verification.resendCount >= 5) {
      throw new BadRequestError(
        "Maximum OTP resend attempts reached."
      );
    }

    const newOtp = generateCode();

    // Send first; update the stored OTP only after email succeeds
    await sendVerificationEmail(normalizedEmail, newOtp);

    verification.code = await bcrypt.hash(newOtp, 10);
    verification.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    verification.lastSentAt = now;
    verification.resendCount += 1;

    await verification.save();

    sendResponse(
      res,
      new SuccessResponse("OTP resent successfully."),
      200
    );

  } catch (error) {
    next(error);
  }
});

// ======================================================
// EXPORT ROUTER
// ======================================================

export default router;
