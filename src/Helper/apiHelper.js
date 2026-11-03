import userRoutes from "../routes/userRoutes.js";
import tdlRoutes from "../routes/todolistRoutes.js";
import templateRoutes from "../routes/templateRoutes.js";
import feedbackRoutes from "../routes/feedbackRoutes.js";

export const initiateApp = (expressApp) => {
  expressApp.use(userRoutes);
  expressApp.use(tdlRoutes);
  expressApp.use(templateRoutes);
  expressApp.use(feedbackRoutes);
};
