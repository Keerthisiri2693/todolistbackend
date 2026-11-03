import jwt from "jsonwebtoken";
import { UserLoginCredentials } from "../models/loginModels.js";
import { ForbiddenError, UnauthorizedError } from "../../response.js";

export const authendicate = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader) throw new UnauthorizedError("Access-Denied..");

    // Remove Bearer
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7).trim()
      : authHeader.trim();

    if (!token) throw new UnauthorizedError("Token missing");

    // Verify token
    const verified = jwt.verify(token, process.env.SECRET_KEY_FOR_TOKEN);

    console.log("✅ JWT VERIFIED:", verified);

    if (!verified.userId) throw new ForbiddenError("Invalid User...");

    // Check user in database
    const isUserExist = await UserLoginCredentials.findOne({
      userId: verified.userId,
    });

    if (!isUserExist) throw new ForbiddenError("Invalid User...");

    // Save userId for later APIs
    req.userId = verified.userId;

    next();
  } catch (error) {
    // console.error("❌ AUTH ERROR:", error);

    if (error.name === "TokenExpiredError" || error.name === "jwt expired")
      throw new UnauthorizedError("Session Expired");

    if (error.name === "JsonWebTokenError")
      throw new ForbiddenError("Invalid User...");
    next(error);
  }
};
