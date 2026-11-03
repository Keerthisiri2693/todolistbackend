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
import {
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  InternalServerError,
  ConflictError,
  SuccessResponse,
  sendResponse,
} from "../../response.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ========================================================================
// Creat new Todo List
// ========================================================================
router.post(
  "/api/createTodolist",
  upload.array("file", 5),
  authendicate,
  async (req, res, next) => {
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
      if (!token) {
        throw new UnauthorizedError("Token required..");
      }
      const userId = await getUserIdFromToken(token);
      if (!userId) {
        throw new NotFoundError("Can't find user details..");
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0); // reset to midnight
      // Format as YYYY-MM-DD in local time
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
      sendResponse(
        res,
        new SuccessResponse("Todolist created successfully..", {
          data: task,
        }),
        201,
      );
    } catch (error) {
      next(error);
    }
  },
);

// ========================================================================
// Update Todo List Details
// ========================================================================
router.put(
  "/api/updateTodolist/:id",
  upload.array("file", 5),
  authendicate,
  async (req, res, next) => {
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
      const task = await TodolistSchema.findOne({ tdlId });
      if (!task) throw new NotFoundError("Todolist not Found");
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
        throw new NotFoundError("Todolist not found..");
      }
      sendResponse(
        res,
        new SuccessResponse("Todolist updated successfully..", {
          data: updatedTask,
        }),
        200,
      );
    } catch (error) {
      next(error);
    }
  },
);

// ========================================================================
// Update Todo List Status
// ========================================================================

router.put(
  "/api/updateTdlStatus/:tdlId",
  authendicate,
  async (req, res, next) => {
    try {
      const { tdlId } = req.params;
      const { status } = req.body;
      if (!status) {
        throw new BadRequestError("Status is required");
      }
      const validStatuses = ["Upcoming", "Today", "Completed"];

      if (!tdlId) throw new BadRequestError("Task ID is required..");

      if (!validStatuses.includes(status)) {
        throw new BadRequestError("Invalid status value..");
      }

      const token = req.header("Authorization");
      if (!token) {
        throw new UnauthorizedError("Token required..");
      }

      const userId = await getUserIdFromToken(token);

      if (!userId) {
        throw new UnauthorizedError("Invalid authentication token..");
      }

      const task = await TodolistSchema.findOne({
        tdlId,
        userId: String(userId),
      });

      if (!task) throw new NotFoundError("Task not found for this user..");

      task.status = status;
      task.updatedAt = new Date();

      await task.save();

      console.log("Checklist widget updated:", {
        tdlId,
        status,
        userId: String(userId),
      });
      sendResponse(
        res,
        new SuccessResponse("Todolist status updated successfully..", {
          data: task,
        }),
        200,
      );
    } catch (error) {
      next(error);
    }
  },
);

// =========================================================================
// Get All Todo List
// =========================================================================

router.get("/api/todolist", authendicate, async (req, res, next) => {
  try {
    const userId = await getUserIdFromToken(req.header("Authorization"));
    const tasks = await TodolistSchema.find({ userId }).sort({ date: 1 });
    sendResponse(
      res,
      new SuccessResponse("Todolists..", {
        data: tasks,
      }),
      200,
    );
  } catch (error) {
    next(error);
  }
});

// =========================================================================
// Get Todo List Medai by ID
// =========================================================================
router.get("/api/media/:id", async (req, res, next) => {
  try {
    // Check Gridfsbucket is initialized
    if (!gridfsbucket)
      throw new InternalServerError("GridFS is not initialized.");

    const fileId = String(req.params.id).trim();

    if (!mongoose.Types.ObjectId.isValid(fileId))
      throw new BadRequestError("Invalid media ID..");

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

    if (!files || files.length === 0)
      throw new NotFoundError("Media file not found..");

    const file = files[0];

    // ------------------------------------------------------
    // CONTENT TYPE
    // ------------------------------------------------------

    res.set("Content-Type", file.contentType || "application/octet-stream");
    res.set("Cache-Control", "public, max-age=3600");
    res.set("Content-Disposition", "inline");

    // ------------------------------------------------------
    // DOWNLOAD
    // ------------------------------------------------------

    const downloadStream = gridfsbucket.openDownloadStream(objectId);

    downloadStream.on("error", (error) => {
      console.error("❌ GRIDFS DOWNLOAD ERROR:", error);

      if (!res.headersSent) throw new NotFoundError("Media file not found");
    });

    downloadStream.pipe(res);
  } catch (error) {
    console.error("❌ MEDIA GET ERROR:", error);

    if (!res.headersSent)
      throw new InternalServerError("Failed to load media...");
  }
});

// =========================================================================
// Delete Todo List
// =========================================================================

router.post("/api/deleteTodos/:id", authendicate, async (req, res, next) => {
  try {
    const tdlId = req.params.id;
    const token = req.header("Authorization");
    if (!token) {
      throw new UnauthorizedError("Token required..");
    }
    const userId = await getUserIdFromToken(token);
    if (!userId) {
      throw new NotFoundError("Can't find user details..");
    }
    const isexist = await TodolistSchema.findOne({ tdlId });
console.log(isexist);

    if (!isexist) {
      throw new NotFoundError("Todolist not found..");
    }

    const deleteTodos = await TodolistSchema.findOneAndDelete({
      userId: userId,
      tdlId: tdlId,
    });
    if (!deleteTodos) throw new BadRequestError("Can't delete this Todo..");

    sendResponse(
      res,
      new SuccessResponse("Todo deleted successfully..", {}),
      200,
    );
  } catch (error) {
    next(error);
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

// ========================================================================
// Change PIN Note
// ========================================================================
router.post("/api/changePinNote/:id", async (req, res, next) => {
  try {
    const { pin } = req.body;

    const tdlId = req.params.id;
if(!tdlId)
  throw new NotFoundError("Todolist not found..")
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
      throw new NotFoundError("Todolist not found..");
    }

    sendResponse(
      res,
      new SuccessResponse("Pin Note Changed..", {
        data: updatedPinTask,
      }),
      200,
    );
  } catch (error) {
    next(error);
  }
});

// ========================================================================
// Lock Note
// ========================================================================
router.post("/api/lockNote/:id", authendicate, async (req, res, next) => {
  try {
    const { lockPin } = req.body;
    const tdlId = req.params.id;
    const token = req.header("Authorization");
    if (!token) {
      throw new UnauthorizedError("Token required..");
    }

    const userId = await getUserIdFromToken(token);
    if (!userId) {
      throw new NotFoundError("UserID not found..");
    }
    const noteData = await TodolistSchema.findOne({ tdlId: tdlId });
    if (!noteData) {
      throw new NotFoundError("Todolist not found..");
    }
    await noteData.setPin(lockPin);
    noteData.locked = true;
    await noteData.save();

    sendResponse(
      res,
      new SuccessResponse("Note Locked successfully..", {
        data: noteData,
      }),
      200,
    );
  } catch (error) {
    next(error);
  }
});

// ========================================================================
// Unlock Note
// ========================================================================
router.post("/api/unlockNote/:id", authendicate, async (req, res, next) => {
  try {
    const { lockPin } = req.body;
    const tdlId = req.params.id;
    const token = req.header("Authorization");
    if (!token) {
      throw new UnauthorizedError("Token required..");
    }

    const userId = await getUserIdFromToken(token);
    if (!userId) throw new NotFoundError("UserID not found..");

    const noteData = await TodolistSchema.findOne({ tdlId: tdlId });
    if (!noteData) throw new NotFoundError("Todolist not found..");
    if (!noteData.locked) {
      throw new BadRequestError("Note is not locked..");
    }

    const valid = await noteData.verifyPin(lockPin);

    if (!valid) {
      throw new UnauthorizedError("Invalid PIN");
    }

    noteData.locked = false;
    noteData.lockPin = null;
    await noteData.save();

    sendResponse(
      res,
      new SuccessResponse("Note Unlocked successfully..", {
        data: noteData,
      }),
      200,
    );
  } catch (error) {
    next(error);
  }
});

export default router;
