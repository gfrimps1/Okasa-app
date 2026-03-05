import { Router } from "express";
import db from "../db.js";

const router = Router();

// ── GET /api/v1/lessons ──
// Returns all lessons with their phrases, ordered by sort_order
router.get("/", (req, res) => {
  try {
    const lessons = db
      .prepare("SELECT * FROM lessons ORDER BY sort_order ASC")
      .all();

    const phrases = db
      .prepare("SELECT * FROM phrases ORDER BY lesson_id, sort_order ASC")
      .all();

    // Group phrases by lesson_id
    const phrasesByLesson = {};
    for (const phrase of phrases) {
      if (!phrasesByLesson[phrase.lesson_id]) {
        phrasesByLesson[phrase.lesson_id] = [];
      }
      phrasesByLesson[phrase.lesson_id].push({
        id: phrase.id,
        twi: phrase.twi,
        phonetic: phrase.phonetic,
        english: phrase.english,
        emoji: phrase.emoji,
        context: phrase.context,
      });
    }

    // Format response to match frontend LESSONS structure
    const result = lessons.map((lesson) => ({
      id: lesson.slug,
      dbId: lesson.id,
      title: lesson.title,
      subtitle: lesson.subtitle,
      icon: lesson.icon,
      color: lesson.color,
      difficulty: lesson.difficulty,
      world: lesson.world,
      bgGrad: lesson.bg_grad,
      phrases: phrasesByLesson[lesson.id] || [],
    }));

    res.json({ lessons: result });
  } catch (err) {
    console.error("Lessons error:", err);
    res.status(500).json({ error: "Failed to fetch lessons" });
  }
});

// ── GET /api/v1/lessons/:slug ──
router.get("/:slug", (req, res) => {
  try {
    const lesson = db
      .prepare("SELECT * FROM lessons WHERE slug = ?")
      .get(req.params.slug);

    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    const phrases = db
      .prepare("SELECT * FROM phrases WHERE lesson_id = ? ORDER BY sort_order ASC")
      .all(lesson.id);

    res.json({
      lesson: {
        id: lesson.slug,
        dbId: lesson.id,
        title: lesson.title,
        subtitle: lesson.subtitle,
        icon: lesson.icon,
        color: lesson.color,
        difficulty: lesson.difficulty,
        world: lesson.world,
        bgGrad: lesson.bg_grad,
        phrases: phrases.map((p) => ({
          id: p.id,
          twi: p.twi,
          phonetic: p.phonetic,
          english: p.english,
          emoji: p.emoji,
          context: p.context,
        })),
      },
    });
  } catch (err) {
    console.error("Lesson detail error:", err);
    res.status(500).json({ error: "Failed to fetch lesson" });
  }
});

export default router;
