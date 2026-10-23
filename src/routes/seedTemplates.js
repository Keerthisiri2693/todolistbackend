// seedTemplates.js
import mongoose from "mongoose";
import { TemplateSchema } from "../models/templateModels.js";

 const templates = [
    { name: "Grocery List", previewText: "🥬 Produce\n🥛 Dairy & Eggs\n...", items: ["Apples","Milk"], emoji: "🥬" },
    { name: "ToDo List", previewText: "✅ Work\n✅ Personal\n...", items: ["Finish project","Pay bills"], emoji: "✅" },
    { name: "Travel Packing List", previewText: "🎒 Essentials\n👕 Clothing\n...", items: ["Passport","T-Shirts"], emoji: "🎒" },
    { name: "Account List", previewText: "💳 Bank Accounts\n💻 Online Accounts\n...", items: ["Savings Account","Netflix"], emoji: "💳" },
    { name: "Gift List", previewText: "🎁 Family\n🎁 Friends\n...", items: ["Watch","Perfume"], emoji: "🎁" },
    { name: "Donation List", previewText: "🙏 Charity\n🙏 Community\n...", items: ["Clothes","Books"], emoji: "🙏" },
    { name: "Movie List", previewText: "🎬 Must Watch\n🎬 Favorites\n...", items: ["Inception","Interstellar"], emoji: "🎬" },
    { name: "Wish List", previewText: "🌟 Dreams\n🌟 Goals\n...", items: ["New Laptop","Vacation"], emoji: "🌟" },
    { name: "Reading List", previewText: "📚 Fiction\n📚 Non-Fiction\n...", items: ["1984","Sapiens"], emoji: "📚" },
    { name: "Birthday List", previewText: "🎂 Family\n🎂 Friends\n...", items: ["Mom - Jan 5","Best Friend - Mar 12"], emoji: "🎂" }
  ];

export async function seed() {
  try {
   await TemplateSchema.deleteMany(); // clear old templates
    await TemplateSchema.insertMany(templates);
    console.log("Templates seeded successfully!");
  } catch (err) {
    console.error(err);
  }
}


