/**
 * Kling AI Lip-Sync API Client
 * Handles JWT authentication, job submission, status polling, and video download.
 *
 * Kling API docs: https://app.klingai.com/global/dev/document-api
 * Lip-sync: image + audio → talking head video
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

const KLING_BASE = process.env.KLING_API_BASE_URL || "https://api.klingai.com";
const API_KEY = () => process.env.KLING_API_KEY || "";
const API_SECRET = () => process.env.KLING_API_SECRET || "";

// ── JWT Token Generation (Kling uses HS256 JWT for auth) ──

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateKlingToken() {
  const key = API_KEY();
  const secret = API_SECRET();
  if (!key || !secret) throw new Error("KLING_API_KEY and KLING_API_SECRET are required");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: key,
    exp: now + 1800, // 30 min validity
    iat: now,
    nbf: now - 5,
  };

  const segments = [
    base64url(Buffer.from(JSON.stringify(header))),
    base64url(Buffer.from(JSON.stringify(payload))),
  ];

  const signature = crypto
    .createHmac("sha256", secret)
    .update(segments.join("."))
    .digest();

  return segments.join(".") + "." + base64url(signature);
}

// ── API Request Helper ──

async function klingFetch(endpoint, options = {}) {
  const token = generateKlingToken();
  const url = `${KLING_BASE}${endpoint}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.message || `Kling API error: ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// ── Submit Lip-Sync Job ──

/**
 * Submit a lip-sync job to Kling.
 * Kling lip-sync requires a VIDEO (not an image) and audio.
 * @param {string} videoUrl - Public URL or base64 of the source video (2-10s, 720p/1080p)
 * @param {string} audioData - Public URL or base64 of the audio to lip-sync
 * @param {string} audioType - "file" for base64/upload, "url" for public URL
 * @returns {Promise<{taskId: string}>}
 */
export async function submitLipSync(videoUrl, audioData, audioType = "file") {
  const body = {
    input: {
      video_url: videoUrl,
      mode: "audio2video",
      audio_type: audioType,
      ...(audioType === "file" ? { audio_file: audioData } : { audio_url: audioData }),
    },
  };

  const data = await klingFetch("/v1/videos/lip-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Kling returns: { code: 0, data: { task_id: "..." } }
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error("No task_id returned from Kling lip-sync API");

  console.log(`  🎬 Kling lip-sync submitted: ${taskId}`);
  return { taskId };
}

/**
 * Submit lip-sync using local files (converts to base64).
 * @param {string} videoPath - Local path to source video (mp4)
 * @param {string} audioPath - Local path to audio file
 * @returns {Promise<{taskId: string}>}
 */
export async function submitLipSyncFromFiles(videoPath, audioPath) {
  const videoBuffer = fs.readFileSync(videoPath);
  const audioBuffer = fs.readFileSync(audioPath);

  const videoExt = path.extname(videoPath).slice(1) || "mp4";
  const audioExt = path.extname(audioPath).slice(1) || "mp3";

  const videoBase64 = `data:video/${videoExt};base64,${videoBuffer.toString("base64")}`;
  const audioBase64 = `data:audio/${audioExt};base64,${audioBuffer.toString("base64")}`;

  return submitLipSync(videoBase64, audioBase64, "file");
}

// ── Poll Task Status ──

/**
 * Check the status of a Kling lip-sync task.
 * @param {string} taskId
 * @returns {Promise<{status: string, videoUrl?: string, duration?: number}>}
 */
export async function pollTaskStatus(taskId) {
  const data = await klingFetch(`/v1/videos/lip-sync/${taskId}`);

  // Kling statuses: submitted | processing | succeed | failed
  const task = data?.data;
  if (!task) throw new Error("Invalid poll response from Kling");

  const result = {
    status: task.task_status || "unknown",
    videoUrl: null,
    duration: null,
  };

  if (result.status === "succeed" && task.task_result?.videos?.length > 0) {
    result.videoUrl = task.task_result.videos[0].url;
    result.duration = task.task_result.videos[0].duration;
  }

  if (result.status === "failed") {
    result.error = task.task_status_msg || "Kling generation failed";
  }

  return result;
}

// ── Download Video ──

/**
 * Download a generated video from Kling to local storage.
 * @param {string} url - Kling video URL
 * @param {string} destPath - Local file path to save
 * @returns {Promise<{size: number}>}
 */
export async function downloadVideo(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download video: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);

  console.log(`  📥 Downloaded Kling video: ${destPath} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
  return { size: buffer.length };
}

// ── Check if Kling is configured ──

export function isKlingConfigured() {
  return !!(process.env.KLING_API_KEY && process.env.KLING_API_SECRET);
}

export default {
  submitLipSync,
  submitLipSyncFromFiles,
  pollTaskStatus,
  downloadVideo,
  isKlingConfigured,
};
