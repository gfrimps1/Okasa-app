import { Router } from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadLimiter } from "../middleware/rateLimit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, "..", process.env.UPLOAD_DIR || "uploads");

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

// File filter — only accept images
const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (JPEG, PNG, GIF, WebP) are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

const router = Router();

// ── POST /api/v1/avatars/upload ──
router.post(
  "/upload",
  requireAuth,
  uploadLimiter,
  (req, res, next) => {
    upload.single("avatar")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "File too large. Maximum size is 5MB." });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const { filename, originalname, mimetype, size } = req.file;

      // Save avatar record
      db.prepare(`
        INSERT INTO avatars (user_id, filename, original_name, mime_type, size_bytes)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.userId, filename, originalname, mimetype, size);

      // Update profile avatar URL
      const avatarUrl = `/api/v1/avatars/${filename}`;
      db.prepare("UPDATE profiles SET avatar_url = ? WHERE user_id = ?").run(
        avatarUrl,
        req.userId
      );

      res.json({
        avatar: {
          filename,
          url: avatarUrl,
          originalName: originalname,
          size,
        },
      });
    } catch (err) {
      console.error("Avatar upload error:", err);
      res.status(500).json({ error: "Failed to upload avatar" });
    }
  }
);

// ── GET /api/v1/avatars/:filename ──
// Serve uploaded avatar files
router.get("/:filename", (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(uploadDir, filename);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: "Avatar not found" });
    }
  });
});

export default router;
