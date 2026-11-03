// =============================================================================
// REMINDER
// =============================================================================

import cron from "node-cron";
import { getUserIdFromToken } from "./helper.js";
import { TodolistSchema } from "../models/todolistModels.js";

const jobs = {};

// =================================================================================
// Schedule Alarm
// =================================================================================
export const scheduleAlarm = (task) => {
  if (!task.reminderDate && !task.reminderTime) return;

  const date = new Date(task.reminderDate || task.alarm);
  const [hour, minute] = task.reminderTime
    ? task.reminderTime.split(":").map(Number)
    : [date.getHours(), date.getMinutes()];

  const key = `${task._id}`;
  if (jobs[key]) jobs[key].stop(); // avoid duplicates

  let cronExpression;

  switch (task.recurring) {
    case "daily":
      cronExpression = `${minute} ${hour} * * *`; // every day
      break;
    case "weekly":
      const dayOfWeek = date.getDay(); // 0=Sunday
      cronExpression = `${minute} ${hour} * * ${dayOfWeek}`;
      break;
    case "monthly":
      const dayOfMonth = date.getDate();
      cronExpression = `${minute} ${hour} ${dayOfMonth} * *`;
      break;
    default: // one-time
      cronExpression = `${minute} ${hour} ${date.getDate()} ${date.getMonth() + 1} *`;
      break;
  }

  jobs[key] = cron.schedule(cronExpression, () => {
    console.log(`⏰ Reminder: Task "${task.title}" is due!`);
    // Here you can send email/push notification instead of console.log
  });
};

// =================================================================================
// Add Reminder
// =================================================================================
export const addReminder = async (req, res,next) => {
  try {
    const { reminderDate, reminderTime, recurring } = req.body;
    const tdlId = req.params.id;
    const token = req.header("Authorization");

     if (!token) {
                 throw new UnauthorizedError("Token required..");
               }
         const userId = await getUserIdFromToken(token);
            if (!userId) {
           throw new NotFoundError("Can't find user details..");
         }
    const task = await TodolistSchema.findOne({ userId, tdlId });

    if (!task) {
      throw new NotFoundError("Todolist not found..");
    
    }
    task.reminderDate = reminderDate;
    task.reminderTime = reminderTime;
    task.recurring = recurring || "none";
    await task.save();

    scheduleAlarm(task); // schedule after saving
     sendResponse(
        res,
        new SuccessResponse("Reminder added successfully..", {
          data: task,
        }),
        200,
      );
   
  } catch (error) {
    next(error)
  }
};

// =================================================================================
// Set Reminder Date
// =================================================================================
export const setReminderDate = async (req, res,next) => {
  try {
    const { reminderDate } = req.body;
    const tdlId = req.params.id;
    const token = req.header("Authorization");
     if (!token) {
                 throw new UnauthorizedError("Token required..");
               }
         const userId = await getUserIdFromToken(token);
            if (!userId) {
           throw new NotFoundError("Can't find user details..");
         }
    const task = await TodolistSchema.findOne({ userId, tdlId });

    if (!task) {
      throw new NotFoundError("Todolist not found..");
    }
    task.reminderDate = reminderDate;
    await task.save();

    scheduleAlarm(task); // schedule after saving
        sendResponse(
        res,
        new SuccessResponse("Reminder date added successfully..", {
          data: task,
        }),
        200,
      );
   
  } catch (error) {
    next(error)
  }
};

// =================================================================================
// Set Reminder Time
// =================================================================================
export const setReminderTime = async (req, res,next) => {
  try {
    const { reminderTime } = req.body;
    const tdlId = req.params.id;
    const token = req.header("Authorization");
       if (!token) {
                 throw new UnauthorizedError("Token required..");
               }
         const userId = await getUserIdFromToken(token);
            if (!userId) {
           throw new NotFoundError("Can't find user details..");
         }
    const task = await TodolistSchema.findOne({ userId, tdlId });

    if (!task) {
    throw new NotFoundError("Todolist not found..");
    }
    task.reminderTime = reminderTime;
    await task.save();

    scheduleAlarm(task); // schedule after saving
      sendResponse(
        res,
        new SuccessResponse("Reminder Time added successfully..", {
          data: task,
        }),
        200,
      );
  } catch (error) {
   next(error)
  }
};

// =================================================================================
// Edit Reminder
// =================================================================================
export const editReminder = async (req, res,next) => {
  try {
    const { reminderDate, reminderTime, recurring } = req.body;
    const tdlId = req.params.id;
    const token = req.header("Authorization");
       if (!token) {
                 throw new UnauthorizedError("Token required..");
               }
         const userId = await getUserIdFromToken(token);
            if (!userId) {
           throw new NotFoundError("Can't find user details..");
         }
    const task = await TodolistSchema.findOne({ userId, tdlId });

    if (!task) {
      throw new NotFoundError("Todolist not found..");
    }
    // Update only provided fields
    if (reminderDate) task.reminderDate = reminderDate;
    if (reminderTime) task.reminderTime = reminderTime;
    if (recurring) task.recurring = recurring;
    await task.save();

    scheduleAlarm(task); // schedule after saving

      sendResponse(
        res,
        new SuccessResponse("Reminder updated successfully..", {
          data: task,
        }),
        200,
      );
  } catch (error) {
    next(error)
  }
};

// =================================================================================
// Delete Reminder
// =================================================================================
export const deleteReminder = async (req, res,next) => {
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
    const task = await TodolistSchema.findOne({ userId, tdlId });

    if (!task) {
      throw new NotFoundError("Todolist not found..");
    }
    // Delete reminder
    task.reminderDate = null;
    task.reminderTime = null;
    task.recurring = "none";
    await task.save();

    scheduleAlarm(task); // schedule after saving

       sendResponse(
        res,
        new SuccessResponse("Reminder deleted successfully..", {
          data: task,
        }),
        200,
      );
  } catch (error) {
   next(error)
  }
};

// =================================================================================
// Snooze Reminder
// =================================================================================
export const snoozeReminder = async (req, res,next) => {
  // const { snoozeMinutes } = req.body; // e.g. 5, 10, 30
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
    const task = await TodolistSchema.findOne({ userId, tdlId });

    if (!task) {
      throw new NotFoundError("Todolist not found..");
    }

    // Calculate new reminder time
    const snoozeMinutes = Number(req.body.snoozeMinutes);
    const currentDate = new Date(task.reminderDate);

    if (task.reminderTime) {
      const [hour, minute] = task.reminderTime.split(":").map(Number);
      currentDate.setHours(hour, minute, 0, 0);
    }

    const newDate = new Date(currentDate.getTime() + snoozeMinutes * 60000);

    task.reminderDate = newDate.toISOString().split("T")[0];
    task.reminderTime = newDate.toTimeString().slice(0, 5); // HH:mm format
    await task.save();

    scheduleAlarm(task); // schedule after saving

       sendResponse(
        res,
        new SuccessResponse("Snooze Reminder set successfully..", {
          data: task,
        }),
        200,
      );
  } catch (error) {
    next(error)
  }
};
