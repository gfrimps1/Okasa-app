import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { globalLimiter } from "./middleware/rateLimit.js";
import { startPollingLoop } from "./services/avatarPipeline.js";

// Route imports
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profiles.js";
import lessonRoutes from "./routes/lessons.js";
import progressRoutes from "./routes/progress.js";
import avatarRoutes from "./routes/avatars.js";
import quizRoutes from "./routes/quiz.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === "production";

// ── Ensure upload directories exist ──
const uploadBase = path.resolve(__dirname, process.env.UPLOAD_DIR || "uploads");
for (const sub of ["", "videos", "frames", "tts-audio", "avatar-videos"]) {
  const dir = path.join(uploadBase, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const app = express();

// ── Security middleware ──
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", "blob:", "data:"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  } : false,
}));

if (isProd) {
  // Production: same-origin, no CORS needed
  app.use(cors({ origin: false }));
} else {
  // Development: allow Vite dev server
  app.use(cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  }));
}

// ── Parsing ──
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// ── Logging ──
app.use(morgan(isProd ? "combined" : "dev"));

// ── Global rate limiter ──
app.use(globalLimiter);

// ── API routes ──
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/profiles", profileRoutes);
app.use("/api/v1/lessons", lessonRoutes);
app.use("/api/v1/progress", progressRoutes);
app.use("/api/v1/avatars", avatarRoutes);
app.use("/api/v1/quiz", quizRoutes);

// ── Health check ──
app.get("/api/v1/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── 404 handler for API ──
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// ── Serve React frontend in production ──
if (isProd) {
  const distPath = path.resolve(__dirname, "../dist");
  app.use(express.static(distPath));
  // SPA fallback — serve index.html for all non-API routes
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start avatar pipeline polling loop ──
startPollingLoop();

// ── Start server ──
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🌍 Ɔkasa server running on port ${PORT}`);
  console.log(`   Health check: /api/v1/health`);
  console.log(`   Mode: ${isProd ? "PRODUCTION" : "development"}`);
  if (isProd) console.log(`   Serving React from: ../dist/`);
  console.log("");
});
