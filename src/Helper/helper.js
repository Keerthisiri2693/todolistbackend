import jwt from "jsonwebtoken";
import { UserLoginCredentials } from "../models/loginModels.js";

// ============================================================
// GET FOLDER BY MIME TYPE
// ============================================================

export const getFolderByMimeType = (mimetype = "") => {
  if (mimetype.startsWith("image/")) {
    return "images";
  }
  if (mimetype.startsWith("video/")) {
    return "videos";
  }
  if (mimetype.startsWith("audio/")) {
    return "audios";
  }
  return "documents";
};

// ============================================================
// GENERATE TOKEN
// ============================================================

export const generateToken = (data) => {
  const secretKey = process.env.SECRET_KEY_FOR_TOKEN;

  if (!secretKey) {
    throw new Error("SECRET_KEY_FOR_TOKEN is not configured.");
  }

  return jwt.sign(data, secretKey);
};

// ============================================================
// GET USER ID FROM TOKEN
// ============================================================

export const getUserIdFromToken = (token) => {
  const secretKey = process.env.SECRET_KEY_FOR_TOKEN;

  if (!secretKey) {
    throw new Error("SECRET_KEY_FOR_TOKEN is not configured.");
  }

  if (!token) {
    throw new Error("Authorization token is required.");
  }

  // Support "Bearer TOKEN"
  const cleanToken = token.startsWith("Bearer ") ? token.substring(7) : token;

  const decoded = jwt.verify(cleanToken, secretKey);

  return decoded.userId;
};

// ============================================================
// GET USER DATA FROM TOKEN
// ============================================================

export const getUserDataFromToken = async (token) => {
  try {
    const secretKey = process.env.SECRET_KEY_FOR_TOKEN;

    if (!secretKey) {
      throw new Error("SECRET_KEY_FOR_TOKEN is not configured.");
    }

    if (!token) {
      throw new Error("Authorization token is required.");
    }

    const cleanToken = token.startsWith("Bearer ") ? token.substring(7) : token;

    // Verify token instead of only decoding it
    const decoded = jwt.verify(cleanToken, secretKey);

    if (!decoded?.userId) {
      throw new Error("Invalid token: userId not found.");
    }

    const getUserDetails = await UserLoginCredentials.findOne(
      {
        userId: decoded.userId,
      },
      {
        __v: 0,
        createdAt: 0,
        updatedAt: 0,
      },
    );

    if (!getUserDetails) {
      return {
        success: false,
        error: "User not found.",
      };
    }

    return getUserDetails;
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};
