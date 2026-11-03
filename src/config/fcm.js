// =============================================================================
// FCM - Notification
// =============================================================================

import admin from "firebase-admin";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { promises as fs } from "fs";

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const serviceAccount = JSON.parse(
  await fs.readFile(new URL("./firebase-adminsdk.json", import.meta.url)),
);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "videocallactivity-fafbb.appspot.com",
  });
}

console.log("✅ Firebase Admin initialized");
console.log("✅ typeof admin.messaging:", typeof admin.messaging);
console.log(
  "✅ typeof sendToDevice:",
  typeof admin.messaging().sendEachForMulticast,
);

export const bucket = admin.storage().bucket();
export default admin;
