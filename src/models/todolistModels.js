import mongoose from "mongoose";
import bcrypt from "bcrypt";

var Schema = mongoose.Schema;

const todolistSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    tdlId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    date: Date,
    text: {
      type: String,
      default: "",
    },
    noteType: {
      type: String,
      required: true,
    },
    type: [
      {
        type: String,
        enum: ["image", "audio", "video", "application"],
        required: true,
      },
    ],
    fileIds: [
      {
        type: String,
        required: true,
      },
    ], // GridFS reference for media

    reminderDate: { type: Date }, // new field
    reminderTime: { type: String }, // new field (HH:mm format)
    recurring: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly"],
      default: "none",
    },
    createdAt: {
      type: Date,
      index: true,
    },
    updatedAt: {
      type: Date,
      index: true,
    },
    status: {
      type: String,
      enum: ["Completed", "Today", "Upcoming"],
      default: "Future",
    },
    isPin: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
    lockPin: { type: String }, //hashed pin
  },
  {
    timestamps: true,
  },
);

// Add methods to schema
todolistSchema.methods.setPin = async function (pin) {
  const salt = await bcrypt.genSalt(10);
  this.lockPin = await bcrypt.hash(pin, salt);
};

todolistSchema.methods.verifyPin = async function (pin) {
  return await bcrypt.compare(pin, this.lockPin);
};

export const TodolistSchema = mongoose.model("Todolist", todolistSchema);
