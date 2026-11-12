import crypto from "crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcrypt";

import { Verification } from "../models/verificationModels.js";
import { UserLoginCredentials } from "../models/loginModels.js";

// Gmail SMTP configuration. EMAIL_USER and EMAIL_PASS must be set in Render.
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
});

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error("[EMAIL] EMAIL_USER or EMAIL_PASS is missing.");
} else {
  transporter.verify()
    .then(() => console.log("[EMAIL] Gmail SMTP connection successful."))
    .catch((error) => {
      console.error("[EMAIL] Gmail SMTP connection failed:", {
        code: error.code,
        command: error.command,
        responseCode: error.responseCode,
        response: error.response,
        message: error.message,
      });
    });
}

export function generateCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

export async function sendVerificationEmail(email, code) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("Gmail environment variables are missing on the server.");
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const result = await transporter.sendMail({
      from: {
        name: "TodoList Support",
        address: process.env.EMAIL_USER,
      },
      to: normalizedEmail,
      subject: "TodoList - Email Verification Code",
      text: `Your TodoList verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:25px;background:#f4f8f5;border-radius:12px;">
          <h2 style="color:#064E3B;">TodoList Email Verification</h2>
          <p>Your verification code is:</p>
          <div style="background:#fff;padding:20px;text-align:center;border-radius:10px;">
            <h1 style="color:#16a085;letter-spacing:8px;font-size:32px;">${code}</h1>
          </div>
          <p>This OTP expires in 10 minutes.</p>
          <p>Please do not share this code with anyone.</p>
          <p>Thanks,<br/>TodoList Support</p>
        </div>
      `,
    });

    console.log("[EMAIL] SMTP send result:", {
      to: normalizedEmail,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      response: result.response,
    });

    if (!result.accepted || result.accepted.length === 0) {
      throw new Error("SMTP server did not accept the recipient.");
    }

    return true;
  } catch (error) {
    console.error("[EMAIL] OTP sending failed:", {
      code: error.code,
      command: error.command,
      responseCode: error.responseCode,
      response: error.response,
      message: error.message,
      recipient: normalizedEmail,
    });
    throw error;
  }
}

export async function saveVerification(email, code, purpose) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!["registration", "forgotPassword"].includes(purpose)) {
    throw new Error("Invalid OTP purpose.");
  }

  const hashedOtp = await bcrypt.hash(String(code), 10);

  await Verification.deleteMany({ email: normalizedEmail, purpose });
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

  console.log("[OTP] Verification record saved:", { email: normalizedEmail, purpose });
  return true;
}

async function validateOtp(email, code, purpose) {
  const normalizedEmail = email.trim().toLowerCase();
  const record = await Verification.findOne({ email: normalizedEmail, purpose });

  if (!record) throw new Error("Invalid or expired OTP. Please request a new one.");

  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    await Verification.deleteOne({ _id: record._id });
    throw new Error("OTP has expired. Please request a new OTP.");
  }

  if ((record.attempts || 0) >= 5) {
    await Verification.deleteOne({ _id: record._id });
    throw new Error("Maximum OTP verification attempts reached. Request a new OTP.");
  }

  const isValid = await bcrypt.compare(String(code), record.code);
  if (!isValid) {
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts >= 5) {
      await Verification.deleteOne({ _id: record._id });
      throw new Error("Maximum OTP verification attempts reached. Request a new OTP.");
    }
    await record.save();
    throw new Error("Invalid OTP.");
  }

  return record;
}

export async function verifyCode(email, code, purpose = "registration") {
  if (purpose !== "registration") throw new Error("Invalid registration verification purpose.");

  const normalizedEmail = email.trim().toLowerCase();
  const record = await validateOtp(normalizedEmail, code, purpose);
  const result = await UserLoginCredentials.updateOne(
    { email: normalizedEmail, isVerified: false },
    { $set: { isVerified: true } }
  );

  if (result.matchedCount === 0) {
    const user = await UserLoginCredentials.findOne({ email: normalizedEmail });
    if (!user) throw new Error("User not found.");
    if (user.isVerified) throw new Error("Email is already verified.");
  }

  await Verification.deleteOne({ _id: record._id });
  return true;
}

export async function verifyForgotPasswordCode(email, code) {
  return validateOtp(email, code, "forgotPassword");
}
