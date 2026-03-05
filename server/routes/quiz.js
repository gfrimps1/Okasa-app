import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── POST /api/v1/quiz/submit ──
// Submit a batch of quiz answers for a lesson
router.post("/submit", requireAuth, (req, res) => {
  try {
    const { lesson_slug, answers } = req.body;

    if (!lesson_slug || typeof lesson_slug !== "string") {
      return res.status(400).json({ error: "lesson_slug is required" });
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: "answers array is required" });
    }

    // Look up the lesson
    const lesson = db.prepare("SELECT id FROM lessons WHERE slug = ?").get(lesson_slug);
    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    // Get all phrases for this lesson to validate answers
    const phrases = db
      .prepare("SELECT id, twi, english FROM phrases WHERE lesson_id = ?")
      .all(lesson.id);

    const phraseMap = new Map(phrases.map((p) => [p.id, p]));

    // Process each answer in a transaction
    let correctCount = 0;
    const insertSubmission = db.prepare(`
      INSERT INTO quiz_submissions (user_id, lesson_id, phrase_id, selected_answer, correct)
      VALUES (?, ?, ?, ?, ?)
    `);

    const processAnswers = db.transaction(() => {
      for (const answer of answers) {
        const { phrase_id, selected_answer } = answer;
        const phrase = phraseMap.get(phrase_id);

        if (!phrase) continue; // Skip invalid phrase IDs

        const isCorrect =
          typeof selected_answer === "string" &&
          selected_answer.toLowerCase().trim() === phrase.english.toLowerCase().trim();

        if (isCorrect) correctCount++;

        insertSubmission.run(
          req.userId,
          lesson.id,
          phrase_id,
          typeof selected_answer === "string" ? selected_answer.slice(0, 200) : "",
          isCorrect ? 1 : 0
        );
      }
    });

    processAnswers();

    const totalQuestions = answers.length;
    const score = Math.round((correctCount / totalQuestions) * 100);

    res.json({
      score,
      correct: correctCount,
      total: totalQuestions,
      passed: score >= 60,
    });
  } catch (err) {
    console.error("Quiz submit error:", err);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
});

// ── GET /api/v1/quiz/history/:lessonSlug ──
// Get quiz history for a specific lesson
router.get("/history/:lessonSlug", requireAuth, (req, res) => {
  try {
    const lesson = db
      .prepare("SELECT id FROM lessons WHERE slug = ?")
      .get(req.params.lessonSlug);

    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    const submissions = db
      .prepare(`
        SELECT qs.*, p.twi, p.english
        FROM quiz_submissions qs
        JOIN phrases p ON p.id = qs.phrase_id
        WHERE qs.user_id = ? AND qs.lesson_id = ?
        ORDER BY qs.submitted_at DESC
        LIMIT 50
      `)
      .all(req.userId, lesson.id);

    res.json({ submissions });
  } catch (err) {
    console.error("Quiz history error:", err);
    res.status(500).json({ error: "Failed to fetch quiz history" });
  }
});

export default router;
