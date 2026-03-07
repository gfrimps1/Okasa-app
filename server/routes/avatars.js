import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadLimiter } from "../middleware/rateLimit.js";
import { validateVideo, extractBestFrame } from "../services/frameExtractor.js";
import { startGeneration, getJobProgress, getAvatarVideos } from "../services/avatarPipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, "..", process.env.UPLOAD_DIR || "uploads");

// ── Ensure upload subdirectories exist ──
for (const sub of ["", "videos", "frames", "tts-audio", "avatar-videos"]) {
  const dir = path.join(uploadDir, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ══════════════════════════════════════════
// IMAGE AVATAR UPLOAD (existing)
// ══════════════════════════════════════════

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const imageFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (JPEG, PNG, GIF, WebP) are allowed"), false);
  }
};

const imageUpload = multer({
  storage: imageStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

const router = Router();

// ── POST /api/v1/avatars/upload (image) ──
router.post(
  "/upload",
  requireAuth,
  uploadLimiter,
  (req, res, next) => {
    imageUpload.single("avatar")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "File too large. Maximum size is 5MB." });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No image file provided" });

      const { filename, originalname, mimetype, size } = req.file;
      db.prepare(`INSERT INTO avatars (user_id, filename, original_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)`).run(req.userId, filename, originalname, mimetype, size);

      const avatarUrl = `/api/v1/avatars/${filename}`;
      db.prepare("UPDATE profiles SET avatar_url = ? WHERE user_id = ?").run(avatarUrl, req.userId);

      res.json({ avatar: { filename, url: avatarUrl, originalName: originalname, size } });
    } catch (err) {
      console.error("Avatar upload error:", err);
      res.status(500).json({ error: "Failed to upload avatar" });
    }
  }
);

// ══════════════════════════════════════════
// VIDEO AVATAR UPLOAD + GENERATION
// ══════════════════════════════════════════

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(uploadDir, "videos")),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp4";
    cb(null, `vid_${crypto.randomUUID()}${ext}`);
  },
});

const videoFilter = (req, file, cb) => {
  const allowed = ["video/mp4", "video/quicktime", "video/webm"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only video files (MP4, MOV, WebM) are allowed"), false);
  }
};

const maxVideoSize = parseInt(process.env.MAX_VIDEO_UPLOAD_MB || "50", 10) * 1024 * 1024;

const videoUpload = multer({
  storage: videoStorage,
  fileFilter: videoFilter,
  limits: { fileSize: maxVideoSize },
});

// ── POST /api/v1/avatars/upload-video ──
// Upload a parent video, validate, extract best frame
router.post(
  "/upload-video",
  requireAuth,
  uploadLimiter,
  (req, res, next) => {
    videoUpload.single("video")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: `File too large. Maximum size is ${process.env.MAX_VIDEO_UPLOAD_MB || 50}MB.` });
        }
        return res.status(400).json({ error: err.message });
      }
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No video file provided" });

      const { filename, originalname, mimetype, size, path: filePath } = req.file;

      // Validate video with ffprobe
      const validation = await validateVideo(filePath);
      if (!validation.valid) {
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: validation.error });
      }

      // Save source video record
      const result = db.prepare(`
        INSERT INTO avatar_source_videos (user_id, video_filename, original_name, mime_type, size_bytes, status)
        VALUES (?, ?, ?, ?, ?, 'processing')
      `).run(req.userId, filename, originalname, mimetype, size);

      const sourceVideoId = Number(result.lastInsertRowid);

      // Extract best frame
      const framesDir = path.join(uploadDir, "frames");
      const frameResult = await extractBestFrame(filePath, framesDir);

      // Update source video record with frame info
      db.prepare(`
        UPDATE avatar_source_videos
        SET frame_filename = ?, frame_extracted_at = datetime('now'), status = 'ready'
        WHERE id = ?
      `).run(frameResult.filename, sourceVideoId);

      // Update profile avatar URL to the extracted frame
      const frameUrl = `/api/v1/avatars/frame/${frameResult.filename}`;
      db.prepare("UPDATE profiles SET avatar_url = ? WHERE user_id = ?").run(frameUrl, req.userId);

      console.log(`📹 Video uploaded: user=${req.userId}, frame=${frameResult.filename}`);

      res.json({
        sourceVideoId,
        frameUrl,
        video: {
          filename,
          originalName: originalname,
          size,
          duration: validation.duration,
          resolution: `${validation.width}x${validation.height}`,
        },
      });
    } catch (err) {
      console.error("Video upload error:", err);
      res.status(500).json({ error: "Failed to process video upload" });
    }
  }
);

// ── POST /api/v1/avatars/generate ──
// Trigger avatar generation for all lesson phrases
router.post("/generate", requireAuth, async (req, res) => {
  try {
    const { sourceVideoId } = req.body;
    if (!sourceVideoId) {
      return res.status(400).json({ error: "sourceVideoId is required" });
    }

    const result = startGeneration(req.userId, sourceVideoId);
    res.json(result);
  } catch (err) {
    console.error("Generation trigger error:", err);
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/v1/avatars/generation-status ──
// Poll generation progress
router.get("/generation-status", requireAuth, (req, res) => {
  try {
    const progress = getJobProgress(req.userId);
    if (!progress) {
      return res.json({ status: "none", total: 0, completed: 0, failed: 0, percent: 0 });
    }
    res.json(progress);
  } catch (err) {
    console.error("Generation status error:", err);
    res.status(500).json({ error: "Failed to get generation status" });
  }
});

// ── GET /api/v1/avatars/videos ──
// Get all avatar videos for the current user
router.get("/videos", requireAuth, (req, res) => {
  try {
    const videos = getAvatarVideos(req.userId);
    res.json({ videos });
  } catch (err) {
    console.error("Get avatar videos error:", err);
    res.status(500).json({ error: "Failed to get avatar videos" });
  }
});

// ── GET /api/v1/avatars/video/:phraseId ──
// Serve a generated avatar video file
router.get("/video/:phraseId", requireAuth, (req, res) => {
  try {
    const phraseId = parseInt(req.params.phraseId, 10);
    if (isNaN(phraseId)) return res.status(400).json({ error: "Invalid phrase ID" });

    const av = db.prepare(
      "SELECT video_filename, audio_filename, status FROM avatar_videos WHERE user_id = ? AND phrase_id = ?"
    ).get(req.userId, phraseId);

    if (!av) return res.status(404).json({ error: "Avatar video not found" });

    // If video is ready, serve the video file
    if (av.status === "ready" && av.video_filename) {
      const videoPath = path.join(uploadDir, "avatar-videos", av.video_filename);
      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ error: "Video file not found on disk" });
      }
      return res.sendFile(videoPath);
    }

    // If TTS-only (no Kling video), serve the audio file
    if (av.status === "tts_only" && av.audio_filename) {
      const audioPath = path.join(uploadDir, "tts-audio", av.audio_filename);
      if (!fs.existsSync(audioPath)) {
        return res.status(404).json({ error: "Audio file not found on disk" });
      }
      res.setHeader("Content-Type", "audio/mpeg");
      return res.sendFile(audioPath);
    }

    res.status(202).json({ status: av.status, message: "Video still processing" });
  } catch (err) {
    console.error("Serve avatar video error:", err);
    res.status(500).json({ error: "Failed to serve video" });
  }
});

// ── GET /api/v1/avatars/audio/:phraseId ──
// Serve TTS audio for a phrase (used when video isn't available but audio is)
router.get("/audio/:phraseId", requireAuth, (req, res) => {
  try {
    const phraseId = parseInt(req.params.phraseId, 10);
    if (isNaN(phraseId)) return res.status(400).json({ error: "Invalid phrase ID" });

    const av = db.prepare(
      "SELECT audio_filename FROM avatar_videos WHERE user_id = ? AND phrase_id = ?"
    ).get(req.userId, phraseId);

    if (!av || !av.audio_filename) {
      return res.status(404).json({ error: "Audio not found" });
    }

    const audioPath = path.join(uploadDir, "tts-audio", av.audio_filename);
    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({ error: "Audio file not found on disk" });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.sendFile(audioPath);
  } catch (err) {
    console.error("Serve audio error:", err);
    res.status(500).json({ error: "Failed to serve audio" });
  }
});

// ── GET /api/v1/avatars/frame/:filename ──
// Serve extracted video frame
router.get("/frame/:filename", (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(uploadDir, "frames", filename);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: "Frame not found" });
  });
});

// ── GET /api/v1/avatars/:filename ──
// Serve uploaded avatar image files (existing)
router.get("/:filename", (req, res) => {
  const filename = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, "");
  const filePath = path.join(uploadDir, filename);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: "Avatar not found" });
  });
});

export default router;
