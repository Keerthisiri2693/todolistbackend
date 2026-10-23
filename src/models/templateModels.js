import mongoose from "mongoose";

var Schema = mongoose.Schema;

export const TemplateSchema = mongoose.model(
  "TemplateSchema",
  new Schema({
    name: {
      type: String,
      required: true,
    },
    previewText: {
      type: String,
    },
    items: [{ type: String }],
    emoji: {
      type: String,
      default: "",
    },
  }),
  "TemplateSchema",
);
