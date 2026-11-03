// =============================================================================
// DATABASE Connection
// =============================================================================

import mongoose from "mongoose";
import { GridFSBucket } from "mongodb";

if (!process.env.MONGODBURI) {
  console.error("❌ MONGODBURI is missing from .env");
} else {
  mongoose
    .connect(process.env.MONGODBURI)
    .then(() => {
      console.log("=================================");
      console.log("✅ Database connected successfully");
      console.log("=================================");
    })
    .catch((error) => {
      console.log("❌ Database not connected successfully..");
      console.error(error);
    });
}

// =============================================================================
// GridfsBucket  for media upload
// =============================================================================

let gridfsbucket;
mongoose.connection.once("open", () => {
  gridfsbucket = new GridFSBucket(mongoose.connection.db, {
    bucketName: "media",
  });
  console.log("✅ GridFSBucket initialized");
});

export { mongoose, gridfsbucket };
