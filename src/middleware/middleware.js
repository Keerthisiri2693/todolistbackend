import jwt from "jsonwebtoken";
import { UserLoginCredentials } from "../models/loginModels.js";

export const authendicate = async (req, res, next) => {
    try {
        const authHeader = req.header("Authorization");

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                error: "Access-Denied"
            });
        }

        // Remove Bearer
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.substring(7).trim()
            : authHeader.trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Token missing"
            });
        }

        // Verify token
        const verified = jwt.verify(
            token,
            process.env.SECRET_KEY_FOR_TOKEN
        );

        console.log("✅ JWT VERIFIED:", verified);

        if (!verified.userId) {
            return res.status(403).json({
                success: false,
                error: "Invalid User"
            });
        }

        // Check user in database
        const isUserExist =
            await UserLoginCredentials.findOne({
                userId: verified.userId
            });

        if (!isUserExist) {
            return res.status(403).json({
                success: false,
                error: "Invalid User"
            });
        }

        // Save userId for later APIs
        req.userId = verified.userId;

        next();

    } catch (error) {

        console.error("❌ AUTH ERROR:", error);

        if (
            error.name === "TokenExpiredError" ||
            error.name === "jwt expired"
        ) {
            return res.status(401).json({
                success: false,
                error: "Session Expired"
            });
        }

        if (error.name === "JsonWebTokenError") {
            return res.status(403).json({
                success: false,
                error: "Invalid User"
            });
        }

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};