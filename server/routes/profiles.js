import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { sanitize, isValidName, isValidLanguage } from "../middleware/validate.js";

const router = Router();

// ── GET /api/v1/profiles/me ──
router.get("/me", requireAuth, (req, res) => {
  try {
    const profile = db
      .prepare("SELECT * FROM profiles WHERE user_id = ?")
      .get(req.userId);

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json({ profile });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ── PUT /api/v1/profiles/me ──
router.put("/me", requireAuth, (req, res) => {
  try {
    const { child_name, parent_name, language } = req.body;
    const updates = [];
    const params = [];

    if (child_name !== undefined) {
      const sanitized = sanitize(child_name, 30);
      if (sanitized && !isValidName(sanitized)) {
        return res.status(400).json({ error: "Invalid child name" });
      }
      updates.push("child_name = ?");
      params.push(sanitized);
    }

    if (parent_name !== undefined) {
      const sanitized = sanitize(parent_name, 30);
      if (sanitized && !isValidName(sanitized)) {
        return res.status(400).json({ error: "Invalid parent name" });
      }
      updates.push("parent_name = ?");
      params.push(sanitized);
    }

    if (language !== undefined) {
      if (!isValidLanguage(language)) {
        return res.status(400).json({ error: "Invalid language selection" });
      }
      updates.push("language = ?");
      params.push(language.toLowerCase());
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    params.push(req.userId);
    db.prepare(`UPDATE profiles SET ${updates.join(", ")} WHERE user_id = ?`).run(...params);

    const profile = db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(req.userId);
    res.json({ profile });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

export default router;
