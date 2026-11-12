
import crypto from "crypto";
import bcrypt from "bcrypt";

import { Verification } from "../models/verificationModels.js";
import { UserLoginCredentials } from "../models/loginModels.js";

// ======================================================
// RESEND EMAIL API CONFIGURATION
// ======================================================

const RESEND_API_URL = "https://api.resend.com/emails";

function getEmailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error(
      "RESEND_API_KEY or EMAIL_FROM is missing in environment variables."
    );
  }

  return { apiKey, from };
}

// ======================================================
// GENERATE SIX-DIGIT OTP
// ======================================================

export function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

// ======================================================
// SEND OTP EMAIL USING RESEND HTTPS API
// ======================================================

export async function sendVerificationEmail(email, code) {
  const normalizedEmail = email.trim().toLowerCase();
  const { apiKey, from } = getEmailConfig();

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:25px;background:#f4f8f5;border-radius:12px;">
      <h2 style="color:#064E3B;">TodoList Email Verification</h2>
      <p>Your verification code is:</p>
      <div style="background:#fff;padding:20px;text-align:center;border-radius:10px;">
        <h1 style="color:#16a085;letter-spacing:8px;font-size:32px;">
          ${code}
        </h1>
      </div>
      <p>This OTP expires in 10 minutes.</p>
      <p>Please do not share this code with anyone.</p>
      <p>Thanks,<br/>TodoList Support</p>
    </div>
  `;

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [normalizedEmail],
        subject: "TodoList - Email Verification Code",
        html,
        text: `Your TodoList verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
      }),
      signal: AbortSignal.timeout(20000),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[EMAIL] Resend API failed:", {
        status: response.status,
        message: result.message || result.error,
        recipient: normalizedEmail,
      });

      throw new Error(
        result.message || result.error || "Email delivery request failed."
      );
    }

    console.log("[EMAIL] Resend accepted email:", {
      recipient: normalizedEmail,
      emailId: result.id,
    });

    return true;
  } catch (error) {
    console.error("[EMAIL] Resend email error:", {
      message: error.message,
      recipient: normalizedEmail,
    });

    throw error;
  }
}

// ======================================================
// SAVE HASHED OTP
// ======================================================

export async function saveVerification(email, code, purpose) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!["registration", "forgotPassword"].includes(purpose)) {
    throw new Error("Invalid OTP purpose.");
  }

  const hashedOtp = await bcrypt.hash(String(code), 10);

  await Verification.deleteMany({
    email: normalizedEmail,
    purpose,
  });

  await Verification.create({
    email: normalizedEmail,
    code: hashedOtp,
    purpose,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    lastSentAt: new Date(),
    resendCount: 0,
    resendBlockedUntil: null,
    attempts: 0,
  });

  console.log("[OTP] Verification record saved:", {
    email: normalizedEmail,
    purpose,
  });

  return true;
}

// ======================================================
// COMMON OTP VALIDATION
// ======================================================

async function validateOtp(email, code, purpose) {
  const normalizedEmail = email.trim().toLowerCase();

  const record = await Verification.findOne({
    email: normalizedEmail,
    purpose,
  });

  if (!record) {
    throw new Error("Invalid or expired OTP. Please request a new one.");
  }

  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    await Verification.deleteOne({ _id: record._id });
    throw new Error("OTP has expired. Please request a new OTP.");
  }

  if ((record.attempts || 0) >= 5) {
    await Verification.deleteOne({ _id: record._id });
    throw new Error("Maximum OTP verification attempts reached.");
  }

  const isValid = await bcrypt.compare(String(code), record.code);

  if (!isValid) {
    record.attempts = (record.attempts || 0) + 1;

    if (record.attempts >= 5) {
      await Verification.deleteOne({ _id: record._id });
      throw new Error(
        "Maximum OTP verification attempts reached. Request a new OTP."
      );
    }

    await record.save();
    throw new Error("Invalid OTP.");
  }

  return record;
}

// ======================================================
// VERIFY REGISTRATION EMAIL
// ======================================================

export async function verifyCode(
  email,
  code,
  purpose = "registration"
) {
  if (purpose !== "registration") {
    throw new Error("Invalid registration verification purpose.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const record = await validateOtp(
    normalizedEmail,
    code,
    purpose
  );

  const result = await UserLoginCredentials.updateOne(
    {
      email: normalizedEmail,
      isVerified: false,
    },
    {
      $set: { isVerified: true },
    }
  );

  if (result.matchedCount === 0) {
    const user = await UserLoginCredentials.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      throw new Error("User not found.");
    }

    if (user.isVerified) {
      throw new Error("Email is already verified.");
    }
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
  return validateOtp(email, code, "forgotPassword");
}
