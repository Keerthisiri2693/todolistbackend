
import express from "express";
import {TemplateSchema} from "../models/templateModels.js";
import { SuccessResponse,sendResponse } from "../../response.js";

const router = express.Router();

// ==========================================================================
// Get all templates
// ==========================================================================
router.get("/api/getAllTemplates", async (req, res,next) => {
   try {
 
     const templates = await TemplateSchema.find();
     if (templates.length === 0) 
       throw new NotFoundError("There is no Templates for this user");
         sendResponse(
            res,
            new SuccessResponse("Templates..", {
              data: templates,
            }),
            200,
          );
    
   } catch (error) {
  next(error);
 }
});

// ==========================================================================
// Get single template
// ==========================================================================
router.get("/api/templates/:id", async (req, res,next) => {
  const template = await TemplateSchema.findById(req.params.id);
  if (!template)
     throw new NotFoundError("There is no Templates for this user");
      sendResponse(
            res,
            new SuccessResponse("Templates..", {
              data: template,
            }),
            200,
          );
 
});

// ==========================================================================
// Use template (copy items into user's list)
// ==========================================================================
router.post("/api/templates/use/:id", async (req, res,next) => {
  const template = await TemplateSchema.findById(req.params.id);
   if (!template)
     throw new NotFoundError("There is no Templates for this user");
       // logic: create new tasks for user based on template.items
      sendResponse(
            res,
            new SuccessResponse("Templates applied..", {
              data: template,
            }),
            200,
          );

});

export default router;
