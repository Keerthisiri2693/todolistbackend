
import "dotenv/config";

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bodyParser from "body-parser";
import http from "http";

import { TodolistSchema } from "./src/models/todolistModels.js";
import { scheduleAlarm } from "./src/Helper/alarm.js";
import "./src/config/db.js";
import { initiateApp } from "./src/Helper/apiHelper.js";
import { seed } from "./src/routes/seedTemplates.js";

// ======================================================
// ERROR HANDLING
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
const port = Number(process.env.PORT) || 5003;

// ======================================================
// CORS
// ======================================================

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ======================================================
// BODY PARSERS
// ======================================================

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Keep the existing bodyParser JSON middleware if your API
// requires it. express.json() above already handles JSON bodies.

// ======================================================
// HEALTH CHECK ROUTES
// ======================================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Todo List Backend API is running",
    status: "healthy",
  });
});

app.get("/health", (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;

  res.status(databaseConnected ? 200 : 503).json({
    success: databaseConnected,
    server: "running",
    database: databaseConnected ? "connected" : "disconnected",
  });
});

// Existing test route
app.get("/api/userLoginOrLogout1", (req, res) => {
  res.status(200).send("Login route works!");
});

// ======================================================
// EXISTING API ROUTES
// ======================================================

initiateApp(app);

// ======================================================
// HTTP SERVER
// ======================================================

const server = http.createServer(app);

// ======================================================
// REMINDER INITIALIZATION
// ======================================================

async function initAlarms() {
  try {
    console.log("Checking scheduled reminders...");

    const tasks = await TodolistSchema.find({
      alarm: { $ne: null },
    });

    for (const task of tasks) {
      try {
        scheduleAlarm(task);
      } catch (error) {
        console.error(`Failed to schedule alarm for task ${task._id}:`, error);
      }
    }

    console.log(`Reminder initialization complete: ${tasks.length} task(s) checked.`);
  } catch (error) {
    console.error("Reminder initialization failed:", error);
  }
}

// ======================================================
// TEMPLATE SEEDING
// ======================================================

async function initSeed() {
  try {
    await seed();
    console.log("Template seeding completed.");
  } catch (error) {
    console.error("Template seeding failed:", error);
  }
}

// ======================================================
// START SERVER
// ======================================================

server.listen(port, "0.0.0.0", () => {
  console.log("======================================");
  console.log("Todo List Backend Started");
  console.log(`PORT: ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("Health check: /health");
  console.log("======================================");

  // Run background initialization without blocking the HTTP listener.
  void initAlarms();
  void initSeed();
});

// ======================================================
// GRACEFUL SHUTDOWN
// ======================================================

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} received. Shutting down...`);

  const forceExit = setTimeout(() => {
    console.error("Shutdown timed out.");
    process.exit(1);
  }, 10000);

  try {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }

    clearTimeout(forceExit);
    console.log("Server shutdown complete.");
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExit);
    console.error("Shutdown error:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
