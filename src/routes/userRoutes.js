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
import { generateCode, sendVerificationEmail, saveVerification, verifyCode } 
  from "../Helper/verificationServices.js";
  import { Verification } from "../models/verificationModels.js";

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
      try {
        const { userName, email, password, confirmPassword } = req.body;
        const userId = await generateUniqueUserId();
        const isUserExcist = await UserLoginCredentials.findOne({
          email: email,
        });
  console.log(userName, email, password, confirmPassword );

        if (isUserExcist)
          throw new ConflictError("This email already registered..");

        if (password !== confirmPassword)
          throw new BadRequestError(
            "Password and confirm password do not match..",
          );
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
          .then(async() => {
            // Generate OTP
      // const code = generateCode();

      // // Save OTP in DB
      // await saveVerification(email, code);

      // // Send OTP via email
      // await sendVerificationEmail(email, code);

            sendResponse(
              res,
              new SuccessResponse("User Registered successfully..", {
                data: userStructure,
              }),
              201,
            );
          })
          .catch((error) => {
            return res.status(400).json({ success: false, error: error.message });
          });
      } catch (error) {
        next(error);
      }
    },
  );

// ========================================================================
// User Mail id Verification
// ========================================================================
router.post("/api/verifyEmail", async (req, res, next) => {
  try {
    const { email, code } = req.body;
    await verifyCode(email, code); // from verificationService.js
    sendResponse(res, new SuccessResponse("Email verified successfully"), 200);
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

    const isUser = await UserLoginCredentials.findOne({ email: email });
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
router.post(
  "/api/updateUserDetails",
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
console.log(req.file);

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
console.log(userId);

      const updateUserDetails = await UserLoginCredentials.findOneAndUpdate(
        { userId: userId },
        { $set: updates },
        { new: true },
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
router.post(
  "/api/sendFcmTokenToBackend",
  authendicate,
  async (req, res, next) => {
    try {
      const { token } = req.body;
      const loginToken = req.header("Authorization");
      const userData = await getUserDataFromToken(loginToken);
      if (!token || !loginToken) {
        throw new UnauthorizedError("Token is missing..");
      }
      const updateToken = await UserLoginCredentials.findOneAndReplace(
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
    const { email } = req.body;

    const user = await UserLoginCredentials.findOne({ email });

    if (!user) {
      throw new BadRequestError("No account found with this email.");
    }


   const code = generateCode();

    await saveVerification(email, code);

    await sendVerificationEmail(email, code);

    sendResponse(
      res,
      new SuccessResponse("OTP sent successfully to your email."),
      200
    );
  } catch (error) {
    next(error);
  }
});

// ========================================================================
// Verify Forgot Password OTP
// ========================================================================
router.post("/api/verifyForgotPasswordOtp", async (req, res, next) => {
  try {
    const { email, otp } = req.body;

  
await verifyCode(email,code)
    sendResponse(
      res,
      new SuccessResponse("OTP verified successfully."),
      200
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
    const { email, otp, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      throw new BadRequestError(
        "Password and confirm password do not match."
      );
    }

 
  await verifyForgotPasswordCode(email, code);
    const hashedPassword = await bcrypt.hash(password, 10);

     await UserLoginCredentials.updateOne(
      { email },
      { $set: { password: hashedPassword } }
    );
     await Verification.deleteMany({ email });

    sendResponse(
      res,
      new SuccessResponse("Password reset successfully."),
      200
    );
  } catch (error) {
    next(error);
  }
});

router.post("/api/resendOtp", async (req, res, next) => {
  try {
    const { email } = req.body;

    const verification = await Verification.findOne({ email });

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
        "Please wait 60 seconds before requesting another OTP"
      );
    }

    // Maximum 5 resends
    if (verification.resendCount >= 5) {
      throw new BadRequestError(
        "Maximum OTP resend attempts reached"
      );
    }

    const newOtp = generateCode();
    const hashedOtp = await bcrypt.hash(
      newOtp,
      10
    );


    verification.code = hashedOtp;
    verification.expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    );
    verification.lastSentAt = now;
    verification.resendCount += 1;

    await verification.save();

    await sendVerificationEmail(email, newOtp);

    sendResponse(
      res,
      new SuccessResponse("OTP resent successfully"),
      200
    );
  } catch (error) {
    next(error);
  }
});
export default router;
