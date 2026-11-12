
// ======================================================
// ENVIRONMENT
// ======================================================

import "dotenv/config";

// ======================================================
// IMPORTS
// ======================================================

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import http from "http";

import { TodolistSchema } from "./src/models/todolistModels.js";
import { scheduleAlarm } from "./src/Helper/alarm.js";

import "./src/config/db.js"; // MongoDB + GridFS initialization

import { initiateApp } from "./src/Helper/apiHelper.js";
import { errorHandler } from "./src/middleware/errorHandler.js";
import { seed } from "./src/routes/seedTemplates.js";

// ======================================================
// ENVIRONMENT VALIDATION
// ======================================================

const port = Number(process.env.PORT) || 5001;

console.log("");
console.log("========== ENVIRONMENT CONFIG ==========");

console.log("PORT:", port);

console.log("EMAIL_USER:", process.env.EMAIL_USER || "NOT CONFIGURED");

console.log(
  "EMAIL_PASS configured:",
  Boolean(process.env.EMAIL_PASS)
);

console.log("========================================");
console.log("");

// ======================================================
// PROCESS ERROR HANDLING
// ======================================================

process.on("uncaughtException", (error) => {
  console.error("");
  console.error("❌ UNCAUGHT EXCEPTION");
  console.error(error);
  console.error("");
});

process.on("unhandledRejection", (reason) => {
  console.error("");
  console.error("❌ UNHANDLED REJECTION");
  console.error(reason);
  console.error("");
});

// ======================================================
// EXPRESS APP
// ======================================================

const app = express();

// ======================================================
// CORS CONFIGURATION
// ======================================================

app.use(
  cors({
    origin: "*",
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

// ======================================================
// BODY PARSER
// ======================================================

app.use(
  express.json({
    limit: "50mb",
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "50mb",
  })
);

// ======================================================
// HEALTH CHECK ROUTES
// ======================================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Todo List Backend API is running",
    status: "OK",
  });
});

app.get("/api/userLoginOrLogout1", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Login route works!",
  });
});

// ======================================================
// EXISTING API ROUTES
// ======================================================

initiateApp(app);

// ======================================================
// ERROR HANDLER
// Must be after all API routes
// ======================================================

app.use(errorHandler);

// ======================================================
// HTTP SERVER
// ======================================================

const server = http.createServer(app);

// ======================================================
// REMINDER INITIALIZATION
// ======================================================

const initAlarms = async () => {
  try {
    console.log("⏰ Initializing reminders...");

    const tasks = await TodolistSchema.find({
      alarm: { $ne: null },
    });

    let count = 0;

    for (const task of tasks) {
      try {
        scheduleAlarm(task);
        count++;
      } catch (error) {
        console.error(
          "❌ Alarm scheduling failed:",
          task._id,
          error.message
        );
      }
    }

    console.log(`✅ ${count} reminders initialized`);

  } catch (error) {
    console.error(
      "❌ Reminder initialization failed:",
      error
    );
  }
};

// ======================================================
// TEMPLATE SEEDING
// ======================================================

const initializeTemplates = async () => {
  try {
    console.log("🌱 Initializing templates...");

    await seed();

    console.log("✅ Template initialization completed");

  } catch (error) {
    console.error(
      "❌ Template initialization failed:",
      error
    );
  }
};

// ======================================================
// START SERVER
// ======================================================

const startServer = async () => {
  try {
    server.listen(port, "0.0.0.0", async () => {
      console.log("");
      console.log("======================================");
      console.log("🚀 TODO LIST BACKEND STARTED");
      console.log("======================================");

      console.log(`PORT: ${port}`);

      console.log(`LOCAL: http://localhost:${port}`);

      console.log(`LAN: http://192.168.1.8:${port}`);

      console.log("--------------------------------------");

      console.log(
        `UPLOAD: http://192.168.1.8:${port}/uploads/`
      );

      console.log(
        `UPLOAD TEST: http://192.168.1.8:${port}/api/upload-test`
      );

      console.log(
        `MEDIA API: http://192.168.1.8:${port}/api/upload-media`
      );

      console.log("======================================");
      console.log("");

      // Initialize background tasks
      await initAlarms();

      await initializeTemplates();
    });

    server.on("error", (error) => {
      console.error("❌ HTTP SERVER ERROR:", error);
    });

  } catch (error) {
    console.error("❌ SERVER STARTUP ERROR:", error);
    process.exit(1);
  }
};

// ======================================================
// GRACEFUL SHUTDOWN
// ======================================================

let isShuttingDown = false;

const shutdown = async (signal) => {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.log("");
  console.log(`🛑 ${signal} received. Shutting down...`);

  try {
    // Stop accepting new HTTP connections
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      console.log("✅ HTTP server closed");
    }

    // Close MongoDB connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();

      console.log("✅ MongoDB connection closed");
    }

    console.log("✅ Server shutdown complete");

    process.exit(0);

  } catch (error) {
    console.error("❌ Shutdown error:", error);

    process.exit(1);
  }
};

// ======================================================
// SHUTDOWN SIGNALS
// ======================================================

process.on("SIGINT", () => shutdown("SIGINT"));

process.on("SIGTERM", () => shutdown("SIGTERM"));

// ======================================================
// START APPLICATION
// ======================================================

startServer();
