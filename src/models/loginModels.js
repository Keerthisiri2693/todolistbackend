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
      required: true
    },
      password: {
      type: String,
      required: true
    },
      profilePicUrl: {
      type: String
    },
      fcmToken: {
      type: String
    },
      isLoggedin: {
      type: String
    },
      Description: {
      type: String
    },
     
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
    },
    {
      timestamps: true,
    },
  ),
  "UserLoginCredentials",
);
