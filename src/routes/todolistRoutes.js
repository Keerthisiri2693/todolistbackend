import express from "express";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { TodolistSchema } from "../models/todolistModels.js";
import { authendicate } from "../middleware/middleware.js";
import { getUserIdFromToken } from "../Helper/helper.js";
import { gridfsbucket } from "../config/db.js";
import mongoose from "mongoose";
import {
  addReminder,
  scheduleAlarm,
  setReminderDate,
  setReminderTime,
  editReminder,
  deleteReminder,
  snoozeReminder,
} from "../Helper/alarm.js";
// import { syncTaskToCalendar } from "../helpers/calendar.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ========================================================================
// Creat new Todo List
// ========================================================================
router.post("/api/createTodolist", upload.array("file", 5), authendicate,async (req, res) => {
    try {
      const {
        title,
        date,
        text,
        reminderDate,
        reminderTime,
        recurring,
        noteType,
      } = req.body;

      let type = [];
      let fileIds = [];

      const token = req.header("Authorization");
      const userId = await getUserIdFromToken(token);
      const today = new Date();

      // Format as YYYY-MM-DD in local time
      const formatted = today.toISOString().split("T")[0];
      const selectedDate = new Date(date);
      selectedDate.setHours(0, 0, 0, 0);

      // Handle multiple files
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const uploadStream = gridfsbucket.openUploadStream(
            file.originalname,
            {
              contentType: file.mimetype,
            },
          );
          uploadStream.end(file.buffer);
          fileIds.push(uploadStream.id);
          type.push(file.mimetype.split("/")[0]);
        }
      }

      const tdlStructure = {
        userId,
        tdlId: uuidv4(),
        title: title || null,
        date: date ? new Date(date) : null,
        text: text || null,
        type,
        fileIds,
        noteType: noteType || null,
        reminderDate: reminderDate || null,
        reminderTime: reminderTime || null,
        recurring: recurring || null,
        createdAt: today,
        updatedAt: today,
        status:
          today.getTime() === selectedDate.getTime()
            ? "Today"
            : today.getTime() < selectedDate.getTime()
              ? "Upcoming"
              : "Completed",
      };

      const task = await TodolistSchema.create(tdlStructure);
      // Schedule reminder if present
      scheduleAlarm(task);
      return res
        .status(200)
        .json({ success: true, data: "Todolist created successfully!", task });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

// ========================================================================
// Update Todo List Details
// ========================================================================
router.put( "/api/updateTodolist/:id", upload.array("file", 5), authendicate, async (req, res) => {
    try {
      const {
        title,
        date,
        text,
        reminderDate,
        reminderTime,
        recurring,
        status,
        noteType,
        pin,
      } = req.body;

      const tdlId = req.params.id;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let fileIds = [];
      let type = [];

      // Handle new files if provided
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          // Normalize MIME type for audio/video/images
          let contentType = file.mimetype;
          const uploadStream = gridfsbucket.openUploadStream(
            file.originalname,
            {
              contentType,
            },
          );
          uploadStream.end(file.buffer);
          fileIds.push(uploadStream.id);
          type.push(contentType.split("/")[0]);
        }
      }

      // Update everything
      const updateData = {
        $set: {
          title: title || undefined,
          date: date ? new Date(date) : undefined,
          text: text || undefined,
          noteType: noteType || null,
          reminderDate: reminderDate || null,
          reminderTime: reminderTime || null,
          recurring: recurring || null,
          status: status || undefined,
          updatedAt: today,
          noteType: noteType,
          isPin: pin,
        },
      };

      // If files are uploaded, add them to the same $set
      if (fileIds.length > 0) {
        updateData.$set.fileIds = fileIds;
        updateData.$set.type = type;
      }

      const updatedTask = await TodolistSchema.findOneAndUpdate(
        { tdlId },
        updateData,
        { new: true },
      );
      if (!updatedTask) {
        return res
          .status(404)
          .json({ success: false, message: "Todolist not found" });
      }

      return res.status(200).json({ success: true, data: updatedTask });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
);

// ========================================================================
// Update Todo List Status
// ========================================================================

router.put("/api/updateTdlStatus/:tdlId",authendicate,async (req, res) => {
    try {
      const { tdlId } = req.params;
      const { status } = req.body;

      const validStatuses = ["Upcoming", "Today", "Completed"];

      if (!tdlId) {
        return res.status(400).json({
          success: false,
          message: "Task ID is required.",
        });
      }

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status value.",
        });
      }

      const token = req.header("Authorization");
      const userId = await getUserIdFromToken(token);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Invalid authentication token.",
        });
      }

      const task = await TodolistSchema.findOne({
        tdlId,
        userId: String(userId),
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found for this user.",
        });
      }

      task.status = status;
      task.updatedAt = new Date();

      await task.save();

      console.log("Checklist widget updated:", {
        tdlId,
        status,
        userId: String(userId),
      });

      return res.status(200).json({
        success: true,
        message: "Task status updated successfully.",
        task,
      });
    } catch (error) {
      console.error("Update task status error:", error);

      return res.status(500).json({
        success: false,
        message: "Server error while updating task status.",
      });
    }
  }
);

// ========================================================================
// Get Todo List
// ========================================================================

router.post("/api/getTodos", authendicate, async (req, res) => {
  try {
    const token = req.header("Authorization");
    const userId = await getUserIdFromToken(token);
    const getTodos = await TodolistSchema.find(
      { userId: userId },
      { __v: 0, _id: 0, createdAt: 0, updatedAt: 0 },
    );
    if (getTodos.length === 0) {
      return res.status(404).json({
        success: false,
        error: "There is no Todos for this user",
        data: [],
      });
    }
    return res.status(200).json({ success: true, data: getTodos });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================================================
// Get All Todo List
// =========================================================================

router.get("/api/todolist", authendicate, async (req, res) => {
  try {
    const userId = await getUserIdFromToken(req.header("Authorization"));
    const tasks = await TodolistSchema.find({ userId }).sort({ date: 1 });

    return res.status(200).json({ success: true, data: tasks });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// =========================================================================
// Get Todo List Medai by ID
// =========================================================================
router.get("/api/media/:id", async (req, res) => {
  try {
    // Check Gridfsbucket is initialized
    if (!gridfsbucket) {
      return res.status(500).json({
        success: false,
        message: "GridFS is not initialized.",
      });
    }

    const fileId = String(req.params.id).trim();

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid media ID.",
      });
    }

    const objectId = new mongoose.Types.ObjectId(fileId);

    // ------------------------------------------------------
    // CHECK FILE
    // ------------------------------------------------------

    const files = await mongoose.connection.db
      .collection("media.files")
      .find({
        _id: objectId,
      })
      .limit(1)
      .toArray();

    if (!files || files.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Media file not found.",
      });
    }

    const file = files[0];

    // ------------------------------------------------------
    // CONTENT TYPE
    // ------------------------------------------------------

    res.set("Content-Type", file.contentType || "application/octet-stream");
    res.set("Cache-Control", "public, max-age=3600");

    // ------------------------------------------------------
    // DOWNLOAD
    // ------------------------------------------------------

    const downloadStream = gridfsbucket.openDownloadStream(objectId);

    downloadStream.on("error", (error) => {
      console.error("❌ GRIDFS DOWNLOAD ERROR:", error);

      if (!res.headersSent) {
        res.status(404).json({
          success: false,
          message: "Media not found.",
        });
      }
    });

    downloadStream.pipe(res);
  } catch (error) {
    console.error("❌ MEDIA GET ERROR:", error);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to load media.",
        error: error.message,
      });
    }
  }
});

// =========================================================================
// Delete Todo List
// =========================================================================

router.post("/api/deleteTodos/:id", authendicate, async (req, res) => {
  try {
    const tdlId = req.params.id;
    const token = req.header("Authorization");
    const userId = await getUserIdFromToken(token);

    const isexist = await TodolistSchema.find({ userId, tdlId });

    if (!isexist) {
      return res.status(404).json({
        success: false,
        message: "Todolist not found.",
      });
    }

    const deleteTodos = await TodolistSchema.findOneAndDelete({
      userId: userId,
      tdlId: tdlId,
    });
    if (!deleteTodos) {
      return res
        .status(400)
        .json({ success: false, error: "Can't delete this Todo." });
    }
    return res
      .status(200)
      .json({ success: true, data: "Todo deleted successfully..!!" });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================================================
// Add Reminder
// ========================================================================
router.post("/api/addReminder/:id", authendicate, addReminder);

// ========================================================================
// Set Reminder Date
// ========================================================================
router.post("/api/setReminderDate/:id", authendicate, setReminderDate);

// ========================================================================
// Set Reminder Time
// ========================================================================
router.post("/api/setReminderTime/:id", authendicate, setReminderTime);

// ========================================================================
// Edit Reminder Time
// ========================================================================
router.post("/api/editReminder/:id", authendicate, editReminder);

// ========================================================================
// Delete Reminder Time
// ========================================================================
router.post("/api/deleteReminder/:id", authendicate, deleteReminder);

// ========================================================================
// Snooze Reminder Time
// ========================================================================
router.post("/api/snoozeReminder/:id", authendicate, snoozeReminder);

router.post("/api/changePinNote/:id", async (req, res) => {
  try {
    const { pin } = req.body;

    const tdlId = req.params.id;

    // Update everything
    const updateData = {
      $set: { isPin: pin },
    };
    const updatedPinTask = await TodolistSchema.findOneAndUpdate(
      { tdlId },
      updateData,
      { new: true },
    );
    if (!updatedPinTask) {
      return res
        .status(404)
        .json({ success: false, message: "Todolist not found" });
    }

    return res.status(200).json({ success: true, data: updatedPinTask });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/api/lockNote/:id", async (req, res) => {
  try {
    const { lockPin } = req.body;
    const tdlId = req.params.id;

    const noteData = await TodolistSchema.findOne({ tdlId: tdlId });
    if (!noteData) {
      return res
        .status(404)
        .json({ success: false, error: "Todolist not found..!!" });
    }
    await noteData.setPin(lockPin);
    noteData.locked = true;
    await noteData.save();

    return res
      .status(200)
      .json({
        success: true,
        message: "Note Locked successfully..!!",
        data: noteData,
      });
  } catch (error) {
    return res.status(500).json({ success: true, error: error.message });
  }
});
router.post("/api/unlockNote/:id", async (req, res) => {
  try {
    const { lockPin } = req.body;
    const tdlId = req.params.id;

    const noteData = await TodolistSchema.findOne({ tdlId: tdlId });
    if (!noteData) {
      return res
        .status(404)
        .json({ success: false, error: "Todolist not found..!!" });
    }
    if (!noteData.locked) {
      return res.json({ message: "Note is not locked" });
    }

    const valid = await noteData.verifyPin(lockPin);

    if (!valid) {
      return res.json({ message: "Invalid PIN" });
    }

    noteData.locked = false;
    noteData.lockPin = null;
    await noteData.save();

    return res
      .status(200)
      .json({
        success: true,
        message: "Note Unlocked successfully..!!",
        data: noteData,
      });
  } catch (error) {
    return res.status(500).json({ success: true, error: error.message });
  }
});

export default router;
