import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "../db.js";
import { signToken, requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import {
  validateBody,
  isValidEmail,
  isValidPassword,
  sanitize,
} from "../middleware/validate.js";

const router = Router();

// ── POST /api/v1/auth/register ──
router.post(
  "/register",
  authLimiter,
  validateBody([
    ["email", isValidEmail, "Valid email is required"],
    ["password", isValidPassword, "Password must be 6-128 characters"],
  ]),
  async (req, res) => {
    try {
      const email = sanitize(req.body.email, 255).toLowerCase();
      const { password } = req.body;

      // Check if user already exists
      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }

      // Hash password
      const salt = await bcrypt.genSalt(12);
      const passwordHash = await bcrypt.hash(password, salt);

      // Create user
      const result = db
        .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
        .run(email, passwordHash);

      const userId = result.lastInsertRowid;

      // Create empty profile
      db.prepare(
        "INSERT INTO profiles (user_id, child_name, parent_name, language) VALUES (?, '', '', 'twi')"
      ).run(userId);

      // Sign token
      const token = signToken(userId);

      res.status(201).json({
        token,
        user: { id: userId, email },
      });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  }
);

// ── POST /api/v1/auth/login ──
router.post(
  "/login",
  authLimiter,
  validateBody([
    ["email", isValidEmail, "Valid email is required"],
    ["password", isValidPassword, "Password must be 6-128 characters"],
  ]),
  async (req, res) => {
    try {
      const email = sanitize(req.body.email, 255).toLowerCase();
      const { password } = req.body;

      const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const token = signToken(user.id);

      res.json({
        token,
        user: { id: user.id, email: user.email },
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  }
);

// ── GET /api/v1/auth/me ──
router.get("/me", requireAuth, (req, res) => {
  try {
    const user = db
      .prepare("SELECT id, email, created_at FROM users WHERE id = ?")
      .get(req.userId);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const profile = db
      .prepare("SELECT child_name, parent_name, language, avatar_url FROM profiles WHERE user_id = ?")
      .get(req.userId);

    // Get total XP
    const xpRow = db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM xp_ledger WHERE user_id = ?")
      .get(req.userId);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
      profile: profile || { child_name: "", parent_name: "", language: "twi", avatar_url: null },
      xp: xpRow.total,
    });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ error: "Failed to fetch user info" });
  }
});

export default router;
