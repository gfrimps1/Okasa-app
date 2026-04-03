/**
 * Video Frame Extractor
 * Extracts the best frame from an uploaded video to use as the avatar source image.
 * Uses fluent-ffmpeg with @ffmpeg-installer/ffmpeg for portability.
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Set both ffmpeg and ffprobe binary paths from installed packages
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

/**
 * Validate a video file using ffprobe.
 * @param {string} videoPath - Path to the video file
 * @returns {Promise<{valid: boolean, duration: number, width: number, height: number, error?: string}>}
 */
export function validateVideo(videoPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        return resolve({ valid: false, duration: 0, width: 0, height: 0, error: err.message });
      }

      const videoStream = metadata.streams?.find((s) => s.codec_type === "video");
      if (!videoStream) {
        return resolve({ valid: false, duration: 0, width: 0, height: 0, error: "No video stream found" });
      }

      const duration = parseFloat(metadata.format?.duration || 0);
      const width = videoStream.width || 0;
      const height = videoStream.height || 0;

      // Validation rules
      if (duration < 3) {
        return resolve({ valid: false, duration, width, height, error: "Video must be at least 3 seconds long" });
      }
      if (duration > 120) {
        return resolve({ valid: false, duration, width, height, error: "Video must be under 2 minutes" });
      }
      if (width < 320 || height < 320) {
        return resolve({ valid: false, duration, width, height, error: "Video resolution must be at least 320x320" });
      }

      resolve({ valid: true, duration, width, height });
    });
  });
}

/**
 * Extract the best frame from a video at the ~2 second mark.
 * @param {string} videoPath - Path to the source video
 * @param {string} outputDir - Directory to save the extracted frame
 * @returns {Promise<{framePath: string, filename: string, width: number, height: number}>}
 */
export function extractBestFrame(videoPath, outputDir) {
  return new Promise((resolve, reject) => {
    const filename = `frame_${crypto.randomUUID().slice(0, 12)}.jpg`;
    const framePath = path.join(outputDir, filename);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    ffmpeg(videoPath)
      .on("end", () => {
        if (!fs.existsSync(framePath)) {
          return reject(new Error("Frame extraction produced no output"));
        }

        // Get frame dimensions via ffprobe
        ffmpeg.ffprobe(framePath, (err, metadata) => {
          if (err) {
            // Still return the frame even if we can't probe it
            return resolve({ framePath, filename, width: 0, height: 0 });
          }
          const stream = metadata.streams?.[0];
          resolve({
            framePath,
            filename,
            width: stream?.width || 0,
            height: stream?.height || 0,
          });
        });
      })
      .on("error", (err) => {
        reject(new Error(`Frame extraction failed: ${err.message}`));
      })
      // Extract a single frame at the 2-second mark (face usually settled by then)
      .screenshots({
        timestamps: ["2"],
        filename,
        folder: outputDir,
        size: "720x?", // Scale to 720px width, maintain aspect ratio
      });
  });
}

/**
 * Trim a video to 2-10 seconds for Kling lip-sync API.
 * Takes the first 10 seconds (or the whole video if shorter).
 * Re-encodes to mp4 at 720p for maximum Kling compatibility.
 * @param {string} inputPath - Source video path
 * @param {string} outputPath - Trimmed output path
 * @returns {Promise<string>} - Path to the trimmed video
 */
export function trimVideoForLipSync(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return reject(new Error(`Probe failed: ${err.message}`));

      const duration = parseFloat(metadata.format?.duration || 0);
      // Kling needs 2-10s. Take up to 10s, starting from 0.
      const trimDuration = Math.min(duration, 10);

      if (trimDuration < 2) {
        return reject(new Error(`Video too short for lip-sync (${trimDuration.toFixed(1)}s, need ≥2s)`));
      }

      // If video is already ≤10s and is mp4, just use the original
      if (duration <= 10 && inputPath.endsWith(".mp4")) {
        return resolve(inputPath);
      }

      ffmpeg(inputPath)
        .setStartTime(0)
        .setDuration(trimDuration)
        .videoCodec("libx264")
        .audioCodec("aac")
        .size("720x?")
        .outputOptions(["-preset", "fast", "-crf", "23", "-movflags", "+faststart"])
        .on("end", () => {
          if (!fs.existsSync(outputPath)) {
            return reject(new Error("Trim produced no output"));
          }
          resolve(outputPath);
        })
        .on("error", (err) => reject(new Error(`Trim failed: ${err.message}`)))
        .save(outputPath);
    });
  });
}

/**
 * Generate a unique filename for uploaded videos.
 * @param {string} originalName
 * @returns {string}
 */
export function videoFilename(originalName) {
  const ext = path.extname(originalName) || ".mp4";
  return `vid_${crypto.randomUUID()}${ext}`;
}

export default { validateVideo, extractBestFrame, trimVideoForLipSync, videoFilename };
