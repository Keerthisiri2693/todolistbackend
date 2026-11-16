
import crypto from "crypto";
import bcrypt from "bcrypt";
import { Resend } from "resend";

import { Verification } from "../models/verificationModels.js";
import { UserLoginCredentials } from "../models/loginModels.js";

export const OTP_PURPOSE = {
  REGISTRATION: "registration",
  FORGOT_PASSWORD: "forgotPassword",
};

// Resend client
const getResend = () => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  return new Resend(process.env.RESEND_API_KEY);
};

// Generate 6-digit OTP
export function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

// Send OTP email
export async function sendVerificationEmail(email, code) {
  const resend = getResend();

  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!fromEmail) {
    throw new Error("RESEND_FROM_EMAIL is not configured.");
  }

  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: "TodoList - Email Verification",
    html: `
      <div style="font-family:Arial;padding:25px;">
        <h2>Verify your TodoList account</h2>
        <p>Your verification code is:</p>
        <h1 style="letter-spacing:8px;">${code}</h1>
        <p>This OTP expires in 10 minutes.</p>
        <p>If you did not request this code, ignore this email.</p>
      </div>
    `,
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  });

  if (error) {
    console.error("RESEND ERROR:", error);
    throw new Error(error.message || "Email sending failed.");
  }

  console.log("OTP email sent successfully:", data?.id);

  return data;
}

// Save hashed OTP
export async function saveVerification(
  email,
  code,
  userData,
  purpose
) {
  const normalizedEmail = email.trim().toLowerCase();

  const hashedOtp = await bcrypt.hash(code, 10);

  await Verification.findOneAndUpdate(
    {
      email: normalizedEmail,
      purpose,
    },
    {
      $set: {
        code: hashedOtp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lastSentAt: new Date(),
        attempts: 0,
        resendCount: 0,
        userData,
        verified: false,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  console.log("OTP saved successfully:", purpose);
}

// Verify OTP
export async function verifyCode(email, code, purpose) {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail || !code || !purpose) {
    throw new Error("Email, OTP and purpose are required.");
  }

  const record = await Verification.findOne({
    email: normalizedEmail,
    purpose,
  });

  if (!record) {
    throw new Error("OTP not found.");
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    throw new Error("OTP expired.");
  }

  // Limit invalid OTP attempts
  if ((record.attempts || 0) >= 5) {
    throw new Error("Maximum OTP attempts reached.");
  }

  const isValid = await bcrypt.compare(
    String(code),
    record.code
  );

  if (!isValid) {
    record.attempts = (record.attempts || 0) + 1;
    await record.save();

    throw new Error("Invalid OTP.");
  }

  // Registration verification
  if (purpose === OTP_PURPOSE.REGISTRATION) {
    if (!record.userData) {
      throw new Error("Registration data not found.");
    }

    const existingUser = await UserLoginCredentials.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      throw new Error("This email is already registered.");
    }

    const user = await UserLoginCredentials.create({
      userId: record.userData.userId,
      userName: record.userData.userName,
      email: normalizedEmail,
      password: record.userData.password,
      profilePicUrl: record.userData.profilePicUrl || null,
      isVerified: true,
      isLoggedin: false,
      fcmToken: null,
    });

    const userResponse = user.toObject();

    // Never expose password hash
    delete userResponse.password;

    await Verification.deleteOne({
      _id: record._id,
    });

    console.log("Registration verified:", normalizedEmail);

    return {
      purpose,
      userResponse,
    };
  }

  // Forgot password verification
  if (purpose === OTP_PURPOSE.FORGOT_PASSWORD) {
    record.verified = true;
    await record.save();

    return {
      purpose,
      email: normalizedEmail,
      verified: true,
    };
  }

  throw new Error("Invalid OTP purpose.");
}
