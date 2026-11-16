
import "dotenv/config";

// ======================================================
// IMPORTS
// ======================================================

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import http from "http";

import { connectDB } from "./src/config/db.js";

import { TodolistSchema } from "./src/models/todolistModels.js";
import { scheduleAlarm } from "./src/Helper/alarm.js";

import { initiateApp } from "./src/Helper/apiHelper.js";
import { errorHandler } from "./src/middleware/errorHandler.js";
import { seed } from "./src/routes/seedTemplates.js";

// ======================================================
// ENVIRONMENT
// ======================================================

const port = Number(process.env.PORT) || 5001;

console.log("========== ENVIRONMENT CONFIG ==========");
console.log("PORT:", port);
console.log("RESEND_API_KEY configured:", Boolean(process.env.RESEND_API_KEY));
console.log("RESEND_FROM_EMAIL configured:", Boolean(process.env.RESEND_FROM_EMAIL));
console.log("MONGODBURI configured:", Boolean(process.env.MONGODBURI));
console.log("========================================");

// ======================================================
// PROCESS ERROR HANDLING
// ======================================================

process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

// ======================================================
// EXPRESS APP
// ======================================================

const app = express();

// ======================================================
// CORS
// ======================================================

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ======================================================
// BODY PARSER
// ======================================================

app.use(express.json({ limit: "50mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "50mb",
  })
);

// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Todo List Backend API is running",
    status: "OK",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
  });
});

app.get("/api/userLoginOrLogout1", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Login route works!",
  });
});

// ======================================================
// API ROUTES
// ======================================================

initiateApp(app);

// ======================================================
// ERROR HANDLER - MUST BE LAST
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
    console.log("Initializing reminders...");

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
          "Alarm scheduling failed:",
          task._id,
          error.message
        );
      }
    }

    console.log(`${count} reminders initialized`);
  } catch (error) {
    console.error("Reminder initialization failed:", error);
  }
};

// ======================================================
// TEMPLATE SEEDING
// ======================================================

const initializeTemplates = async () => {
  try {
    console.log("Initializing templates...");

    await seed();

    console.log("Template initialization completed");
  } catch (error) {
    console.error("Template initialization failed:", error);
  }
};

// ======================================================
// START SERVER
// ======================================================

const startServer = async () => {
  try {
    // 1. Connect MongoDB first
    console.log("Connecting to MongoDB...");

    await connectDB();

    console.log("MongoDB connection completed.");

    // 2. Start HTTP server only after DB connection
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.removeListener("listening", onListening);
        reject(error);
      };

      const onListening = () => {
        server.removeListener("error", onError);
        resolve();
      };

      server.once("error", onError);
      server.once("listening", onListening);

      server.listen(port, "0.0.0.0");
    });

    console.log("======================================");
    console.log("TODO LIST BACKEND STARTED");
    console.log("PORT:", port);
    console.log("DATABASE: CONNECTED");
    console.log("======================================");

    // 3. Initialize background tasks
    await initAlarms();
    await initializeTemplates();

    console.log("Backend initialization completed.");
  } catch (error) {
    console.error("SERVER STARTUP ERROR:", error);

    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close().catch(console.error);
    }

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

  console.log(`${signal} received. Shutting down...`);

  try {
    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      console.log("HTTP server closed.");
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log("MongoDB connection closed.");
    }

    console.log("Shutdown completed.");
    process.exit(0);
  } catch (error) {
    console.error("Shutdown error:", error);
    process.exit(1);
  }
};

// ======================================================
// SIGNAL HANDLERS
// ======================================================

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ======================================================
// START APPLICATION
// ======================================================

startServer();
