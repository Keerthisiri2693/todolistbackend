
import crypto from "crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";

import { Verification } from "../models/verificationModels.js";
import { UserLoginCredentials } from "../models/loginModels.js";

// ======================================================
// GMAIL SMTP CONFIGURATION
// ======================================================

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Check SMTP connection
transporter.verify((error) => {
  if (error) {
    console.error("❌ Gmail SMTP Error:", error.message);
  } else {
    console.log("✅ Gmail SMTP Ready!");
  }
});

// ======================================================
// GENERATE OTP
// ======================================================

export function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

// ======================================================
// SEND OTP EMAIL
// ======================================================

export async function sendVerificationEmail(email, code) {
  try {
    await transporter.sendMail({
      from: `"AST Support" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "AST - Email Verification Code",

      text: `Your verification code is ${code}. It expires in 10 minutes. Do not share this code.`,

      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>AST Email Verification</h2>
          <p>Your verification code is:</p>

          <h1 style="color: #16a085; letter-spacing: 5px;">
            ${code}
          </h1>

          <p>This OTP expires in 10 minutes.</p>
          <p>Please do not share this code with anyone.</p>
        </div>
      `,
    });

    console.log("✅ Verification email sent:", email);

    return true;

  } catch (error) {
    console.error("❌ Email sending failed:", error.message);
    throw new Error("Unable to send verification email.");
  }
}

// ======================================================
// SAVE HASHED OTP
// purpose: registration OR forgotPassword
// ======================================================

export async function saveVerification(email, code, purpose) {
  const hashedOtp = await bcrypt.hash(
    code.toString(),
    10
  );

  await Verification.deleteMany({
    email,
    purpose,
  });

  await Verification.create({
    email,
    code: hashedOtp,
    purpose,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    lastSentAt: new Date(),
    resendCount: 0,
    attempts: 0,
  });

  return true;
}

// ======================================================
// COMMON OTP VALIDATION
// ======================================================

async function validateOtp(email, code, purpose) {
  const record = await Verification.findOne({
    email,
    purpose,
  });

  if (!record) {
    throw new Error("Invalid or expired OTP.");
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await Verification.deleteOne({
      _id: record._id,
    });

    throw new Error("OTP has expired.");
  }

  // Maximum 5 incorrect attempts
  if (record.attempts >= 5) {
    await Verification.deleteOne({
      _id: record._id,
    });

    throw new Error("Maximum OTP verification attempts reached.");
  }

  const isValid = await bcrypt.compare(
    code.toString(),
    record.code
  );

  if (!isValid) {
    record.attempts += 1;

    if (record.attempts >= 5) {
      await Verification.deleteOne({
        _id: record._id,
      });

      throw new Error("Maximum OTP verification attempts reached.");
    }

    await record.save();

    throw new Error("Invalid OTP.");
  }

  return record;
}

// ======================================================
// VERIFY REGISTRATION EMAIL
// ======================================================

export async function verifyCode(email, code, purpose = "registration") {
  const record = await validateOtp(
    email,
    code,
    purpose
  );

  const result = await UserLoginCredentials.updateOne(
    { email },
    {
      $set: {
        isVerified: true,
      },
    }
  );

  if (result.matchedCount === 0) {
    throw new Error("User not found.");
  }

  await Verification.deleteOne({
    _id: record._id,
  });

  return true;
}

// ======================================================
// VERIFY FORGOT PASSWORD OTP
// ======================================================

export async function verifyForgotPasswordCode(email, code) {
  const record = await validateOtp(
    email,
    code,
    "forgotPassword"
  );

  // Return the verified record.
  // Do not delete it until password reset succeeds.
  return record;
}
