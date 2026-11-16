
import dns from "node:dns";
import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";

// Use Google DNS for local development.
// Keep the hosting provider's DNS in production.
if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

let gridfsbucket = null;
let isConnecting = false;

export const connectDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log("MongoDB already connected.");

      if (!gridfsbucket && mongoose.connection.db) {
        gridfsbucket = new GridFSBucket(
          mongoose.connection.db,
          { bucketName: "media" }
        );
      }

      return mongoose.connection;
    }

    if (isConnecting) {
      throw new Error("MongoDB connection is already in progress.");
    }

    isConnecting = true;

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

    if (!mongoose.connection.db) {
      throw new Error("MongoDB database instance is unavailable.");
    }

    gridfsbucket = new GridFSBucket(
      mongoose.connection.db,
      { bucketName: "media" }
    );

    console.log("=================================");
    console.log("DATABASE CONNECTED SUCCESSFULLY");
    console.log("GRIDFS INITIALIZED SUCCESSFULLY");
    console.log("=================================");

    return mongoose.connection;

  } catch (error) {
    gridfsbucket = null;

    console.error("MONGODB CONNECTION ERROR:", error.message);

    throw error;

  } finally {
    isConnecting = false;
  }
};

export const getGridFSBucket = () => {
  if (!gridfsbucket) {
    throw new Error(
      "GridFSBucket has not been initialized. Call connectDB() first."
    );
  }

  return gridfsbucket;
};

export const isDBConnected = () => {
  return mongoose.connection.readyState === 1;
};

export { mongoose };
