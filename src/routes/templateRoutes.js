
import express from "express";
import {TemplateSchema} from "../models/templateModels.js";

const router = express.Router();

// ==========================================================================
// Get all templates
// ==========================================================================
router.get("/api/getAllTemplates", async (req, res) => {
   try {
 
     const templates = await TemplateSchema.find();
     if (templates.length === 0) {
       return res.status(404).json({
         success: false,
         error: "There is no Templates for this user",
         data: [],
       });
     }
     return res.status(200).json({ success: true, data: templates });
   } catch (error) {
     return res.status(500).json({ success: false, error: error.message });
   }
 
 
});

// ==========================================================================
// Get single template
// ==========================================================================
router.get("/api/templates/:id", async (req, res) => {
  const template = await TemplateSchema.findById(req.params.id);
  res.json(template);
});

// ==========================================================================
// Use template (copy items into user's list)
// ==========================================================================
router.post("/api/templates/use/:id", async (req, res) => {
  const template = await TemplateSchema.findById(req.params.id);
  // logic: create new tasks for user based on template.items
  res.json({ message: "Template applied", template });
});

export default router;
