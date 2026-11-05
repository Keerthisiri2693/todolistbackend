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
export async function saveVerification(email, code) {
   const hashedOtp = await bcrypt.hash(otp, 10);

  await Verification.deleteMany({ email });

 await Verification.create({
    email,
    code: hashedOtp,
    expiresAt: new Date(
      Date.now() + 10 * 60 * 1000
    ),
    lastSentAt: new Date(),
    resendCount: 0,
  });
}

// Check code validity
export async function verifyCode(email, code) {
  const record = await Verification.findOne({ email, code });
  if (!record) throw new BadRequestError("Invalid code.");
  if (record.expiresAt < Date.now()) throw new BadRequestError("expired OTP.");
  const isValid = await bcrypt.compare(
    code,
    record.code
  );

  if (!isValid) {
    throw new Error("Invalid OTP");
  }

  await UserLoginCredentials.updateOne({ email }, { isVerified: true });
  await Verification.deleteOne({ _id: record._id });
  return true;
}
export async function verifyForgotPasswordCode(email, code) {
  const record = await Verification.findOne({ email, code });

  if (!record) throw new BadRequestError("Invalid code.");

  if (record.expiresAt < Date.now()) {
    throw new BadRequestError("expired OTP.");
  }

  return true;
}
