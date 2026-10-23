
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";

// ======================================================
// DATABASE CONNECTION
// ======================================================

const MONGODB_URI = process.env.MONGODBURI;

if (!MONGODB_URI) {
  throw new Error(
    "MONGODBURI is missing. Configure it in Render Environment Variables."
  );
}

try {
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  });

  console.log("=================================");
  console.log("✅ Database connected successfully");
  console.log("Database:", mongoose.connection.name);
  console.log("=================================");
} catch (error) {
  console.error("❌ MongoDB connection failed:", error);
  throw error;
}

// ======================================================
// GRIDFS BUCKET
// ======================================================

export let gridfsbucket = null;

if (!mongoose.connection.db) {
  throw new Error("MongoDB connection is not initialized.");
}

gridfsbucket = new GridFSBucket(mongoose.connection.db, {
  bucketName: "media",
});

console.log("✅ GridFSBucket initialized");

export { mongoose };
