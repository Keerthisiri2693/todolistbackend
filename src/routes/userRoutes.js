
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
        if (!existingUser.isVerified) {
          console.warn("[REGISTER] Existing unverified account; use resend OTP");
          throw new ConflictError(
            "Account already exists but email is not verified. Please use Resend OTP."
          );
        }
        throw new ConflictError("This email is already registered. Please log in.");
      }

      console.log("[REGISTER] Validation passed; creating user");

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
      console.log("[REGISTER] User saved");

      // Generate registration OTP
      const code = generateCode();

      // Save hashed OTP
      await saveVerification(normalizedEmail, code, "registration");
      console.log("[REGISTER] OTP saved; attempting email delivery");

      try {
        await sendVerificationEmail(normalizedEmail, code);
        console.log("[REGISTER] OTP accepted by mail server");
      } catch (emailError) {
        // Preserve the OTP record and unverified account for recovery.
        console.error("[REGISTER] OTP email failed:", {
          code: emailError.code,
          command: emailError.command,
          responseCode: emailError.responseCode,
          message: emailError.message,
        });
        throw new InternalServerError(
          "Account created, but email delivery failed. Wait 60 seconds, then use Resend OTP."
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

      // Allow only explicitly editable profile fields.
      const updates = {};
      for (const field of ["userName", "Description"]) {
        if (typeof req.body[field] === "string") {
          updates[field] = req.body[field].trim();
        }
      }

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
    const { email, purpose = "registration" } = req.body;

    if (typeof email !== "string" || !email.trim()) {
      throw new BadRequestError("Email is required.");
    }
    if (!["registration", "forgotPassword"].includes(purpose)) {
      throw new BadRequestError("Invalid OTP purpose.");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await UserLoginCredentials.findOne({ email: normalizedEmail });
    if (!user) {
      throw new NotFoundError("No account found with this email.");
    }
    if (purpose === "registration" && user.isVerified) {
      throw new ConflictError("Email is already verified. Please log in.");
    }

    const now = new Date();
    let verification = await Verification.findOne({
      email: normalizedEmail,
      purpose,
    });

    if (verification) {
      if (verification.resendBlockedUntil &&
          verification.resendBlockedUntil.getTime() > now.getTime()) {
        throw new BadRequestError("OTP resend is temporarily blocked. Try later.");
      }

      if (verification.resendBlockedUntil &&
          verification.resendBlockedUntil.getTime() <= now.getTime()) {
        verification.resendCount = 0;
        verification.resendBlockedUntil = null;
      }

      if (verification.lastSentAt &&
          now.getTime() - new Date(verification.lastSentAt).getTime() < 60000) {
        throw new BadRequestError(
          "Please wait 60 seconds before requesting another OTP."
        );
      }

      if (verification.resendCount >= 5) {
        verification.resendBlockedUntil = new Date(now.getTime() + 15 * 60 * 1000);
        await verification.save();
        throw new BadRequestError(
          "Maximum OTP resends reached. Try again after 15 minutes."
        );
      }
    }

    const newOtp = generateCode();
    console.log("[RESEND OTP] Attempting email delivery", { purpose });

    // Send first so a failed SMTP request does not invalidate an old OTP.
    try {
      await sendVerificationEmail(normalizedEmail, newOtp);
    } catch (emailError) {
      console.error("[RESEND OTP] SMTP failed:", {
        code: emailError.code,
        command: emailError.command,
        responseCode: emailError.responseCode,
        message: emailError.message,
      });
      throw new InternalServerError("Could not send OTP email. Please try again later.");
    }

    if (!verification) {
      // Registration may have saved the user but failed before saving an OTP.
      await saveVerification(normalizedEmail, newOtp, purpose);
    } else {
      verification.code = await bcrypt.hash(newOtp, 10);
      verification.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      verification.lastSentAt = new Date();
      verification.resendCount += 1;
      verification.attempts = 0;
      await verification.save();
    }

    console.log("[RESEND OTP] OTP accepted by mail server", { purpose });
    return sendResponse(
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
