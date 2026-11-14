
import crypto from "crypto";
import { Verification } from "../models/verificationModels.js";
import { UserLoginCredentials } from "../models/loginModels.js";
import bcrypt from "bcrypt";
import { BadRequestError } from "../../response.js";

// ============================================================
// RESEND CONFIGURATION
// ============================================================

const RESEND_API_URL = "https://api.resend.com/emails";

const getResendConfig = () => {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  if (!fromEmail) {
    throw new Error("RESEND_FROM_EMAIL is not configured.");
  }

  return { apiKey, fromEmail };
};

// ============================================================
// OTP PURPOSE
// ============================================================

export const OTP_PURPOSE = {
  REGISTRATION: "registration",
  FORGOT_PASSWORD: "forgotPassword",
};

// ============================================================
// GENERATE 6 DIGIT OTP
// ============================================================

export function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

// ============================================================
// SEND OTP EMAIL USING RESEND HTTPS API
// ============================================================

export async function sendVerificationEmail(email, code) {
  const { apiKey, fromEmail } = getResendConfig();

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: "My Todo - Email Verification Code",
        text: `Your My Todo verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:25px;border:1px solid #e5e7eb;border-radius:12px;">
            <h2 style="color:#064E3B;">My Todo</h2>
            <p>Your email verification code is:</p>
            <h1 style="letter-spacing:8px;color:#064E3B;text-align:center;">
              ${code}
            </h1>
            <p>This code expires in <strong>10 minutes</strong>.</p>
            <p style="color:#777;font-size:13px;">
              Do not share this code with anyone.
            </p>
          </div>
        `,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("RESEND API ERROR:", {
        status: response.status,
        message: result?.message || result?.error,
      });

      throw new Error(
        result?.message ||
        result?.error ||
        `Email service failed with status ${response.status}`
      );
    }

    console.log("OTP email accepted by Resend:", result.id);

    return result;

  } catch (error) {
    console.error("EMAIL SENDING ERROR:", error.message);
    throw error;
  }
}

// ============================================================
// SAVE OTP IN MONGODB
// ============================================================

export async function saveVerification(email, code, userData, purpose) {
  const hashedOtp = await bcrypt.hash(code, 10);

  await Verification.findOneAndUpdate(
    { email, purpose },
    {
      $set: {
        code: hashedOtp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lastSentAt: new Date(),
        attempts: 0,
        resendCount: 0,
        verified: false,
        userData,
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );

  console.log("OTP saved successfully:", purpose);
}

// ============================================================
// VERIFY OTP
// ============================================================

export async function verifyCode(email, code, purpose) {
  if (!email || !code || !purpose) {
    throw new BadRequestError("Email, OTP and purpose are required.");
  }

  const record = await Verification.findOne({
    email,
    purpose,
  });

  if (!record) {
    throw new BadRequestError("OTP not found. Please request a new OTP.");
  }

  if (record.expiresAt < new Date()) {
    throw new BadRequestError("OTP expired. Please request a new OTP.");
  }

  const isValid = await bcrypt.compare(
    String(code),
    record.code
  );

  if (!isValid) {
    throw new BadRequestError("Invalid OTP.");
  }

  // ==========================================================
  // REGISTRATION FLOW
  // ==========================================================

  if (purpose === OTP_PURPOSE.REGISTRATION) {
    if (!record.userData) {
      throw new BadRequestError("Registration details not found.");
    }

    const existingUser = await UserLoginCredentials.findOne({
      email,
    });

    if (existingUser) {
      throw new BadRequestError("This email is already registered.");
    }

    const user = await UserLoginCredentials.create({
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

    // Never return the password hash
    delete userResponse.password;

    await Verification.deleteOne({
      _id: record._id,
    });

    return {
      purpose,
      userResponse,
    };
  }

  // ==========================================================
  // FORGOT PASSWORD FLOW
  // ==========================================================

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

  throw new BadRequestError("Invalid OTP purpose.");
}
