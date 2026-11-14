import crypto from "crypto";
import nodemailer from "nodemailer";
import { Verification } from "../models/verificationModels.js";
import { UserLoginCredentials } from "../models/loginModels.js";
import bcrypt from 'bcrypt';

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
export const OTP_PURPOSE = {
  REGISTRATION: "registration",
  FORGOT_PASSWORD: "forgotPassword",
};
// Generate OTP
export function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
}

// Send email
export async function sendVerificationEmail(email, code) {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Verify your email",
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  });
}

// Save code in DB
export async function saveVerification(email, code, userData,purpose) {
  const hashedOtp = await bcrypt.hash(code, 10);
 
  await Verification.findOneAndUpdate(
    { email, purpose},
    {
      $set: {
        code: hashedOtp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lastSentAt: new Date(),
        attempts: 0,
        userData,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
}

// Check code validity
export async function verifyCode(email, code,purpose) {
  const record = await Verification.findOne({ email,   purpose });
  if (!record) throw new BadRequestError("OTP not found");
  if (record.expiresAt < Date.now()) throw new BadRequestError("OTP expired.");
  const isValid = await bcrypt.compare(
    code,
    record.code
  );

  if (!isValid) {
    throw new Error("Invalid OTP");
  }

    // Registration flow
  if (purpose === OTP_PURPOSE.REGISTRATION) {
      // Create actual user now
  const user  = await UserLoginCredentials.create({
    userId: record.userData.userId,
    userName: record.userData.userName,
    email,
    password: record.userData.password,
    profilePicUrl: record.userData.profilePicUrl,
    isVerified: true,
    isLoggedin: false,
    fcmToken: null,
  });

  const userResponse = user.toObject();
    await Verification.deleteOne({
      _id: record._id,
    });

    return {
      purpose,
      userResponse,
    };
  }
   // Forgot password flow
  if (purpose === OTP_PURPOSE.FORGOT_PASSWORD) {
    await Verification.updateOne(
      { _id: record._id },
      {
        $set: {
          verified: true,
        },
      }
    );

    return {
      purpose,
      email,
      verified: true,
    };
  }
 
}
