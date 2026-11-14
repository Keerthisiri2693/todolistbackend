import mongoose from "mongoose";

var Schema = mongoose.Schema;

export const UserLoginCredentials = mongoose.model(
  "UserLoginCredentials",
  new Schema(
    {
      userId: {
        type: String,
        required: true,
        unique: true,
      },
      userName: {
        type: String,
        required: true,
      },
      email: {
        type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      },
      password: {
        type: String,
        required: true,
      },
      profilePicUrl: {
        type: String,
      },
      fcmToken: {
        type: String,
      },
      isLoggedin: {
        type: String,
      },
      Description: {
        type: String,
      },
      isVerified: { type: Boolean, default: false },

      pinedUsers: [
        {
          userName: String,
          userId: String,
        },
      ],
      lockedUserChat: [
        {
          userName: String,
          userId: String,
          password: String,
        },
      ],
      archivedUser: [
        {
          userName: String,
          userId: String,
        },
      ],
    
      favoritedUser: Array,
      passwordForArchive: String,
      status: Boolean,
      mode :   { type: String,
      enum: ["Android", "Ios", "Desktop","Web"],
      default: "Android"}
    },
    {
      timestamps: true,
    },
  ),
  "UserLoginCredentials",
);
