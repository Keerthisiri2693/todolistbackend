
import jwt from "jsonwebtoken";
import { UserLoginCredentials } from "../models/loginModels.js";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../../response.js";

export const authendicate = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader) {
      throw new UnauthorizedError("Access denied. Token required.");
    }

    // Remove Bearer prefix
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : authHeader.trim();

    if (!token) {
      throw new UnauthorizedError("Token missing.");
    }

    if (!process.env.SECRET_KEY_FOR_TOKEN) {
      throw new Error("SECRET_KEY_FOR_TOKEN is not configured.");
    }

    // Verify JWT
    let verified;

    try {
      verified = jwt.verify(
        token,
        process.env.SECRET_KEY_FOR_TOKEN
      );
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        return next(new UnauthorizedError("Session expired. Please login again."));
      }

      if (
        jwtError.name === "JsonWebTokenError" ||
        jwtError.name === "NotBeforeError"
      ) {
        return next(new ForbiddenError("Invalid authentication token."));
      }

      return next(jwtError);
    }

    if (!verified || !verified.userId) {
      throw new ForbiddenError("Invalid user token.");
    }

    console.log("JWT VERIFIED:", {
      userId: verified.userId,
    });

    // Check user in database
    const existingUser = await UserLoginCredentials.findOne({
      userId: verified.userId,
    });

    if (!existingUser) {
      throw new ForbiddenError("User account not found.");
    }

    // Attach authenticated user information
    req.userId = verified.userId;
    req.user = existingUser;

    return next();

  } catch (error) {
    console.error("AUTHENTICATION ERROR:", {
      message: error.message,
      name: error.name,
    });

    return next(error);
  }
};
