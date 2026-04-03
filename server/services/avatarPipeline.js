/**
 * Avatar Generation Pipeline
 * Orchestrates the full flow: TTS → Kling lip-sync → download → track progress.
 *
 * Design: In-memory tracking with SQLite as durable state.
 * No external queue needed — setInterval-based polling is sufficient for single-instance Railway.
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import db from "../db.js";
import { submitLipSyncFromFiles, pollTaskStatus, downloadVideo, isKlingConfigured } from "./klingApi.js";
import { generateAudio, ttsFilename } from "./ttsService.js";
import { trimVideoForLipSync } from "./frameExtractor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_BASE = path.resolve(__dirname, "..", process.env.UPLOAD_DIR || "uploads");
const CONCURRENCY = parseInt(process.env.AVATAR_GENERATION_CONCURRENCY || "2", 10);
const POLL_INTERVAL_MS = 30_000; // Poll Kling every 30 seconds
const MAX_ATTEMPTS = 3;

let pollingTimer = null;
let isProcessing = false;

// ── Ensure directories exist ──

function ensureDirs() {
  for (const sub of ["videos", "frames", "tts-audio", "avatar-videos"]) {
    const dir = path.join(UPLOAD_BASE, sub);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

// ── Start Generation Job ──

/**
 * Begin avatar generation for a user.
 * Creates the job record and queues all phrases for processing.
 * @param {number} userId
 * @param {number} sourceVideoId
 * @returns {{ jobId: number, totalPhrases: number }}
 */
export function startGeneration(userId, sourceVideoId) {
  ensureDirs();

  // Verify source video exists and belongs to user
  const source = db.prepare(
    "SELECT * FROM avatar_source_videos WHERE id = ? AND user_id = ? AND frame_filename IS NOT NULL"
  ).get(sourceVideoId, userId);

  if (!source) {
    throw new Error("Source video not found or frame not extracted yet");
  }

  // Get all phrases from the database
  const phrases = db.prepare("SELECT id, twi, english FROM phrases").all();
  if (!phrases.length) {
    throw new Error("No lesson phrases found in database");
  }

  // Cancel any existing active jobs for this user
  db.prepare(
    "UPDATE generation_jobs SET status = 'cancelled' WHERE user_id = ? AND status IN ('pending', 'processing')"
  ).run(userId);

  // Clean up old avatar videos for this user
  db.prepare("DELETE FROM avatar_videos WHERE user_id = ?").run(userId);

  // Create the generation job
  const jobResult = db.prepare(`
    INSERT INTO generation_jobs (user_id, source_video_id, total_phrases, status, started_at)
    VALUES (?, ?, ?, 'processing', datetime('now'))
  `).run(userId, sourceVideoId, phrases.length);

  const jobId = jobResult.lastInsertRowid;

  // Create avatar_video records for each phrase
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO avatar_videos (user_id, phrase_id, source_video_id, status)
    VALUES (?, ?, ?, 'pending')
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertStmt.run(item.userId, item.phraseId, item.sourceVideoId);
    }
  });

  insertMany(phrases.map((p) => ({
    userId,
    phraseId: p.id,
    sourceVideoId,
  })));

  // Update profile
  db.prepare("UPDATE profiles SET avatar_type = 'generating' WHERE user_id = ?").run(userId);

  console.log(`\n🎬 Avatar generation started: job=${jobId}, user=${userId}, phrases=${phrases.length}`);

  // Kick off processing asynchronously
  setTimeout(() => processNextBatch(jobId), 500);

  return { jobId: Number(jobId), totalPhrases: phrases.length };
}

// ── Process Next Batch ──

async function processNextBatch(jobId) {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const job = db.prepare("SELECT * FROM generation_jobs WHERE id = ?").get(jobId);
    if (!job || job.status !== "processing") {
      return;
    }

    // Get pending avatar videos for this job's user
    const pending = db.prepare(`
      SELECT av.*, p.twi, p.english
      FROM avatar_videos av
      JOIN phrases p ON av.phrase_id = p.id
      WHERE av.user_id = ? AND av.status = 'pending' AND av.attempts < ?
      LIMIT ?
    `).all(job.user_id, MAX_ATTEMPTS, CONCURRENCY);

    if (!pending.length) {
      // Also check for stuck 'generating' records (older than 2 minutes = likely crashed)
      const stuck = db.prepare(
        "UPDATE avatar_videos SET status = 'pending' WHERE user_id = ? AND status = 'generating' AND updated_at < datetime('now', '-2 minutes')"
      ).run(job.user_id);
      if (stuck.changes > 0) {
        console.log(`  🔧 Reset ${stuck.changes} stuck 'generating' records to 'pending'`);
      }
      checkJobCompletion(jobId);
      return;
    }

    // Get the source video (Kling lip-sync requires a video, not just a frame)
    const source = db.prepare("SELECT * FROM avatar_source_videos WHERE id = ?").get(job.source_video_id);
    if (!source || !source.video_filename) {
      console.error(`  ❌ Source video not found for job ${jobId}`);
      failRemainingPhrases(job.user_id, jobId, "Source video not available");
      checkJobCompletion(jobId);
      return;
    }

    const sourceVideoPath = path.join(UPLOAD_BASE, "videos", source.video_filename);
    if (!fs.existsSync(sourceVideoPath)) {
      console.error(`  ❌ Source video file missing: ${sourceVideoPath}`);
      failRemainingPhrases(job.user_id, jobId, "Source video file missing from disk");
      checkJobCompletion(jobId);
      return;
    }

    // Kling lip-sync requires video 2-10 seconds. Trim if needed.
    let videoPathForKling = sourceVideoPath;
    const trimmedPath = path.join(UPLOAD_BASE, "videos", `trimmed_${source.video_filename}`);
    if (!fs.existsSync(trimmedPath)) {
      try {
        videoPathForKling = await trimVideoForLipSync(sourceVideoPath, trimmedPath);
        console.log(`  ✂️ Trimmed source video for Kling: ${videoPathForKling}`);
      } catch (trimErr) {
        console.warn(`  ⚠️ Video trim failed, using original: ${trimErr.message}`);
        videoPathForKling = sourceVideoPath;
      }
    } else {
      videoPathForKling = trimmedPath;
    }

    // Get the user's language
    const profile = db.prepare("SELECT language FROM profiles WHERE user_id = ?").get(job.user_id);
    const language = profile?.language || "twi";

    console.log(`  📦 Processing batch: ${pending.length} phrases for job ${jobId}`);

    // Process each pending phrase
    for (const av of pending) {
      try {
        // Update status
        db.prepare("UPDATE avatar_videos SET status = 'generating', attempts = attempts + 1, updated_at = datetime('now') WHERE id = ?").run(av.id);

        // Step 1: Generate TTS audio
        const audioFile = ttsFilename(av.phrase_id);
        const audioPath = path.join(UPLOAD_BASE, "tts-audio", audioFile);
        await generateAudio(av.twi, language, audioPath);

        // Update audio filename
        db.prepare("UPDATE avatar_videos SET audio_filename = ? WHERE id = ?").run(audioFile, av.id);

        if (!isKlingConfigured()) {
          // If Kling not configured, mark as ready with just TTS (demo mode)
          console.log(`  ✅ TTS generated for phrase ${av.phrase_id} (tts_only mode)`);
          db.prepare(
            "UPDATE avatar_videos SET status = 'tts_only', updated_at = datetime('now') WHERE id = ?"
          ).run(av.id);

          // Update job progress
          db.prepare(
            "UPDATE generation_jobs SET completed_phrases = completed_phrases + 1 WHERE id = ?"
          ).run(jobId);

          continue;
        }

        // Step 2: Submit to Kling lip-sync API (video + audio)
        const { taskId } = await submitLipSyncFromFiles(videoPathForKling, audioPath);

        // Update with Kling task ID
        db.prepare(
          "UPDATE avatar_videos SET status = 'kling_processing', kling_task_id = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(taskId, av.id);

      } catch (err) {
        console.error(`  ❌ Failed to process phrase ${av.phrase_id}: ${err.message}`);
        db.prepare(
          "UPDATE avatar_videos SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(err.message, av.id);

        db.prepare(
          "UPDATE generation_jobs SET failed_phrases = failed_phrases + 1 WHERE id = ?"
        ).run(jobId);
      }
    }

    // Check if job is complete (no more pending or kling_processing)
    checkJobCompletion(jobId);
  } catch (err) {
    console.error(`Pipeline batch error: ${err.message}`);
  } finally {
    isProcessing = false;

    // Always check for more pending work and schedule next batch
    try {
      const job = db.prepare("SELECT * FROM generation_jobs WHERE id = ?").get(jobId);
      if (job && job.status === "processing") {
        const remaining = db.prepare(
          "SELECT COUNT(*) as c FROM avatar_videos WHERE user_id = ? AND status IN ('pending') AND attempts < ?"
        ).get(job.user_id, MAX_ATTEMPTS);
        if (remaining.c > 0) {
          setTimeout(() => processNextBatch(jobId), 100);
        }
      }
    } catch (_) { /* don't let finally-block errors prevent isProcessing reset */ }
  }
}

// Helper: fail all remaining pending phrases (e.g., frame file missing)
function failRemainingPhrases(userId, jobId, errorMsg) {
  const result = db.prepare(
    "UPDATE avatar_videos SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE user_id = ? AND status IN ('pending', 'generating')"
  ).run(errorMsg, userId);
  if (result.changes > 0) {
    db.prepare(
      "UPDATE generation_jobs SET failed_phrases = failed_phrases + ? WHERE id = ?"
    ).run(result.changes, jobId);
  }
}

// ── Poll Kling Tasks ──

async function pollKlingTasks() {
  // Find all avatar_videos that are waiting on Kling
  const processing = db.prepare(
    "SELECT * FROM avatar_videos WHERE status = 'kling_processing' AND kling_task_id IS NOT NULL"
  ).all();

  if (!processing.length) return;

  console.log(`  🔄 Polling ${processing.length} Kling tasks...`);

  for (const av of processing) {
    try {
      const result = await pollTaskStatus(av.kling_task_id);

      if (result.status === "succeed" && result.videoUrl) {
        // Download the generated video
        const videoFile = `avatar_${av.user_id}_${av.phrase_id}_${Date.now()}.mp4`;
        const videoPath = path.join(UPLOAD_BASE, "avatar-videos", videoFile);
        await downloadVideo(result.videoUrl, videoPath);

        // Update record
        db.prepare(`
          UPDATE avatar_videos
          SET status = 'ready', video_filename = ?, duration_ms = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(videoFile, Math.round((result.duration || 5) * 1000), av.id);

        // Update job progress
        const job = db.prepare(
          "SELECT id FROM generation_jobs WHERE user_id = ? AND status = 'processing' ORDER BY id DESC LIMIT 1"
        ).get(av.user_id);
        if (job) {
          db.prepare("UPDATE generation_jobs SET completed_phrases = completed_phrases + 1 WHERE id = ?").run(job.id);
          checkJobCompletion(job.id);

          // Process more pending phrases
          setTimeout(() => processNextBatch(job.id), 1000);
        }

      } else if (result.status === "failed") {
        console.error(`  ❌ Kling task ${av.kling_task_id} failed: ${result.error}`);

        if (av.attempts < MAX_ATTEMPTS) {
          // Retry
          db.prepare("UPDATE avatar_videos SET status = 'pending', kling_task_id = NULL, error_message = ?, updated_at = datetime('now') WHERE id = ?")
            .run(result.error, av.id);
        } else {
          db.prepare("UPDATE avatar_videos SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?")
            .run(result.error, av.id);

          const job = db.prepare(
            "SELECT id FROM generation_jobs WHERE user_id = ? AND status = 'processing' ORDER BY id DESC LIMIT 1"
          ).get(av.user_id);
          if (job) {
            db.prepare("UPDATE generation_jobs SET failed_phrases = failed_phrases + 1 WHERE id = ?").run(job.id);
            checkJobCompletion(job.id);
          }
        }
      }
      // "submitted" or "processing" — still waiting, do nothing

    } catch (err) {
      console.error(`  ⚠️  Poll error for task ${av.kling_task_id}: ${err.message}`);
    }
  }
}

// ── Check Job Completion ──

function checkJobCompletion(jobId) {
  const job = db.prepare("SELECT * FROM generation_jobs WHERE id = ?").get(jobId);
  if (!job || job.status !== "processing") return;

  // Count remaining and completed from avatar_videos for accuracy
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status IN ('pending', 'generating', 'kling_processing') THEN 1 ELSE 0 END) as remaining,
      SUM(CASE WHEN status IN ('ready', 'tts_only') THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM avatar_videos WHERE user_id = ?
  `).get(job.user_id);

  const remaining = counts.remaining || 0;
  const completed = counts.completed || 0;
  const failed = counts.failed || 0;

  if (remaining === 0) {
    // All done
    const finalStatus = failed > 0 && completed === 0 ? "failed" : "completed";
    db.prepare(
      "UPDATE generation_jobs SET status = ?, completed_phrases = ?, failed_phrases = ?, completed_at = datetime('now') WHERE id = ?"
    ).run(finalStatus, completed, failed, jobId);

    // Update profile avatar type
    const avatarType = completed > 0 ? "ai_video" : "cartoon";
    db.prepare("UPDATE profiles SET avatar_type = ? WHERE user_id = ?").run(avatarType, job.user_id);

    console.log(`\n✅ Generation job ${jobId} ${finalStatus}: ${completed}/${job.total_phrases} succeeded`);
  }
}

// ── Get Job Progress ──

/**
 * Get the current generation progress for a user.
 * @param {number} userId
 * @returns {{ jobId: number, status: string, total: number, completed: number, failed: number, percent: number } | null}
 */
export function getJobProgress(userId) {
  const job = db.prepare(
    "SELECT * FROM generation_jobs WHERE user_id = ? ORDER BY id DESC LIMIT 1"
  ).get(userId);

  if (!job) return null;

  // Recount from avatar_videos for accuracy
  const counts = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('ready', 'tts_only') THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' AND attempts >= ? THEN 1 ELSE 0 END) as failed
    FROM avatar_videos WHERE user_id = ?
  `).get(MAX_ATTEMPTS, userId);

  const total = counts.total || job.total_phrases;
  const completed = counts.completed || 0;
  const failed = counts.failed || 0;
  const percent = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;

  return {
    jobId: job.id,
    status: job.status,
    total,
    completed,
    failed,
    percent,
  };
}

// ── Get Avatar Videos for User ──

/**
 * Get all ready avatar videos for a user.
 * @param {number} userId
 * @returns {Array<{phraseId: number, status: string, videoFilename: string|null, audioFilename: string|null}>}
 */
export function getAvatarVideos(userId) {
  return db.prepare(`
    SELECT phrase_id as phraseId, status, video_filename as videoFilename, audio_filename as audioFilename
    FROM avatar_videos
    WHERE user_id = ?
  `).all(userId);
}

// ── Start Polling Loop ──

/**
 * Start the background polling loop for Kling tasks.
 * Called once at server startup.
 */
export function startPollingLoop() {
  if (pollingTimer) return;

  console.log("🔄 Avatar pipeline polling loop started");

  // Check for any in-progress jobs to resume
  const resumableJobs = db.prepare(
    "SELECT id FROM generation_jobs WHERE status = 'processing'"
  ).all();

  if (resumableJobs.length > 0) {
    console.log(`  📋 Resuming ${resumableJobs.length} generation job(s)...`);
    for (const job of resumableJobs) {
      setTimeout(() => processNextBatch(job.id), 2000);
    }
  }

  // Start periodic Kling task polling
  pollingTimer = setInterval(async () => {
    try {
      await pollKlingTasks();

      // Also try to process more pending items for active jobs
      const activeJobs = db.prepare(
        "SELECT id FROM generation_jobs WHERE status = 'processing'"
      ).all();
      for (const job of activeJobs) {
        // Reset stuck 'generating' records before processing
        const stuck = db.prepare(
          "UPDATE avatar_videos SET status = 'pending' WHERE user_id = (SELECT user_id FROM generation_jobs WHERE id = ?) AND status = 'generating' AND updated_at < datetime('now', '-2 minutes')"
        ).run(job.id);
        if (stuck.changes > 0) {
          console.log(`  🔧 Poll: Reset ${stuck.changes} stuck records for job ${job.id}`);
        }
        await processNextBatch(job.id);
      }
    } catch (err) {
      console.error("Pipeline poll error:", err.message);
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the polling loop (for graceful shutdown).
 */
export function stopPollingLoop() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    console.log("🛑 Avatar pipeline polling loop stopped");
  }
}

export default {
  startGeneration,
  getJobProgress,
  getAvatarVideos,
  startPollingLoop,
  stopPollingLoop,
};
