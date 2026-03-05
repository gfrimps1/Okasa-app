import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── GET /api/v1/progress ──
// Get all progress for the authenticated user
router.get("/", requireAuth, (req, res) => {
  try {
    const rows = db
      .prepare(`
        SELECT p.*, l.slug as lesson_slug
        FROM progress p
        JOIN lessons l ON l.id = p.lesson_id
        WHERE p.user_id = ?
      `)
      .all(req.userId);

    // Format as a map of lesson slug → progress
    const progressMap = {};
    for (const row of rows) {
      progressMap[row.lesson_slug] = {
        completed: !!row.completed,
        score: row.score,
        completedAt: row.completed_at,
      };
    }

    // Get total XP
    const xpRow = db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM xp_ledger WHERE user_id = ?")
      .get(req.userId);

    res.json({
      progress: progressMap,
      xp: xpRow.total,
    });
  } catch (err) {
    console.error("Get progress error:", err);
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

// ── POST /api/v1/progress ──
// Save progress for a specific lesson
router.post("/", requireAuth, (req, res) => {
  try {
    const { lesson_slug, score } = req.body;

    if (!lesson_slug || typeof lesson_slug !== "string") {
      return res.status(400).json({ error: "lesson_slug is required" });
    }

    const numScore = parseInt(score, 10);
    if (isNaN(numScore) || numScore < 0 || numScore > 100) {
      return res.status(400).json({ error: "Score must be 0-100" });
    }

    // Look up the lesson
    const lesson = db.prepare("SELECT id FROM lessons WHERE slug = ?").get(lesson_slug);
    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    // Upsert progress (update if exists, insert if new)
    db.prepare(`
      INSERT INTO progress (user_id, lesson_id, completed, score, completed_at)
      VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, lesson_id) DO UPDATE SET
        completed = 1,
        score = MAX(progress.score, excluded.score),
        completed_at = COALESCE(progress.completed_at, excluded.completed_at)
    `).run(req.userId, lesson.id, numScore);

    // Award XP (10 base + bonus for high scores)
    const xpAmount = numScore >= 80 ? 15 : 10;
    db.prepare(
      "INSERT INTO xp_ledger (user_id, amount, reason) VALUES (?, ?, ?)"
    ).run(req.userId, xpAmount, `Completed ${lesson_slug}`);

    // Return updated progress
    const progress = db
      .prepare("SELECT * FROM progress WHERE user_id = ? AND lesson_id = ?")
      .get(req.userId, lesson.id);

    const xpRow = db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM xp_ledger WHERE user_id = ?")
      .get(req.userId);

    res.json({
      progress: {
        completed: !!progress.completed,
        score: progress.score,
        completedAt: progress.completed_at,
      },
      xpAwarded: xpAmount,
      totalXp: xpRow.total,
    });
  } catch (err) {
    console.error("Save progress error:", err);
    res.status(500).json({ error: "Failed to save progress" });
  }
});

export default router;
