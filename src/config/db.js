
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";

let gridfsbucket = null;

export const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODBURI;

    if (!mongoURI) {
      throw new Error("MONGODBURI is missing from environment variables.");
    }

    console.log("Connecting to MongoDB...");

    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });

    console.log("=================================");
    console.log("DATABASE CONNECTED SUCCESSFULLY");
    console.log("=================================");

    if (!mongoose.connection.db) {
      throw new Error("MongoDB database instance is unavailable.");
    }

    gridfsbucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "media",
    });

    console.log("GridFSBucket initialized successfully");

    return mongoose.connection;
  } catch (error) {
    console.error("MONGODB CONNECTION ERROR:", error);
    throw error;
  }
};

export const getGridFSBucket = () => {
  if (!gridfsbucket) {
    throw new Error("GridFSBucket has not been initialized.");
  }

  return gridfsbucket;
};

export { mongoose };
