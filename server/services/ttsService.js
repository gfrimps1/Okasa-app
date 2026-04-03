/**
 * Text-to-Speech Service for Twi (Akan) language.
 *
 * Uses Google Translate's TTS endpoint as the default provider.
 * This supports Twi ("tw") and is free. When Abena AI's API launches,
 * we can swap in their endpoint for higher-quality native Twi voices.
 *
 * Provider hierarchy:
 *   1. abena  — Abena AI (when available)
 *   2. google — Google Translate TTS (default, free, supports Twi)
 *   3. silent — Silent audio fallback (app uses browser TTS instead)
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const TTS_PROVIDER = () => process.env.TTS_PROVIDER || "google";
const ABENA_API_KEY = () => process.env.ABENA_API_KEY || "";

// Language code mapping
const LANG_MAP = {
  twi: "tw",
  ga: "gaa",
  ewe: "ee",
  fante: "tw", // Fante is close to Twi in Google
  dagbani: "en", // Fallback to English
  english: "en",
};

// ── Google Translate TTS ──

/**
 * Generate audio using Google Translate's TTS endpoint.
 * Supports Twi via language code "tw".
 * @param {string} text - Text to speak
 * @param {string} language - Language key (twi, ga, ewe, etc.)
 * @param {string} outputPath - Path to save MP3 file
 * @returns {Promise<{filename: string, sizeBytes: number, provider: string}>}
 */
async function generateGoogleTTS(text, language, outputPath) {
  const langCode = LANG_MAP[language] || "tw";

  // Google Translate TTS endpoint (supports up to ~200 chars per request)
  // For longer text, we chunk it
  const chunks = chunkText(text, 200);
  const buffers = [];

  for (const chunk of chunks) {
    const encodedText = encodeURIComponent(chunk);
    // Use client=gtx which is more reliable from server environments
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${langCode}&client=gtx&q=${encodedText}&ttsspeed=0.8`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://translate.google.com/",
          Accept: "audio/mpeg, audio/*, */*",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Google TTS failed: ${response.status} ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 100) {
        throw new Error("Google TTS returned empty or too-small audio");
      }
      buffers.push(buffer);
    } finally {
      clearTimeout(timeout);
    }
  }

  const combined = Buffer.concat(buffers);
  fs.writeFileSync(outputPath, combined);

  console.log(`  🔊 TTS generated (google/${langCode}): ${text.slice(0, 40)}... → ${outputPath}`);
  return {
    filename: path.basename(outputPath),
    sizeBytes: combined.length,
    provider: "google",
  };
}

// ── Abena AI TTS (placeholder for when API launches) ──

async function generateAbenaTTS(text, language, outputPath) {
  const apiKey = ABENA_API_KEY();
  if (!apiKey) throw new Error("ABENA_API_KEY not configured");

  // Abena AI API endpoint (to be updated when official docs are available)
  // Placeholder: POST https://api.abena.mobobi.com/v1/tts
  const response = await fetch("https://api.abena.mobobi.com/v1/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      text,
      language: language || "twi",
      speed: 0.85, // Slower for children's learning
      format: "mp3",
    }),
  });

  if (!response.ok) {
    throw new Error(`Abena TTS failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);

  console.log(`  🔊 TTS generated (abena): ${text.slice(0, 40)}... → ${outputPath}`);
  return {
    filename: path.basename(outputPath),
    sizeBytes: buffer.length,
    provider: "abena",
  };
}

// ── Silent audio fallback ──

function generateSilentAudio(outputPath) {
  // Minimal valid MP3 file (~1 second of silence)
  // This is a tiny valid MP3 frame for silence
  const silentMp3 = Buffer.from(
    "//uQxAAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV" +
    "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV" +
    "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV",
    "base64"
  );

  fs.writeFileSync(outputPath, silentMp3);

  console.log(`  🔇 Silent TTS fallback: ${outputPath}`);
  return {
    filename: path.basename(outputPath),
    sizeBytes: silentMp3.length,
    provider: "silent",
  };
}

// ── Helper: chunk text for Google TTS ──

function chunkText(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const words = text.split(" ");
  const chunks = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length > maxLen) {
      chunks.push(current.trim());
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ── Main entry point ──

/**
 * Generate TTS audio for a text phrase.
 * @param {string} text - Text to speak
 * @param {string} language - Language key (twi, ga, ewe, etc.)
 * @param {string} outputPath - Full path to save the audio file
 * @returns {Promise<{filename: string, sizeBytes: number, provider: string}>}
 */
export async function generateAudio(text, language, outputPath) {
  const provider = TTS_PROVIDER();

  try {
    if (provider === "abena" && ABENA_API_KEY()) {
      return await generateAbenaTTS(text, language, outputPath);
    }

    if (provider === "google" || provider === "abena") {
      // Fall back to Google if Abena not available
      return await generateGoogleTTS(text, language, outputPath);
    }

    // Silent fallback
    return generateSilentAudio(outputPath);
  } catch (err) {
    console.error(`  ⚠️  TTS failed (${provider}): ${err.message}. Using silent fallback.`);
    return generateSilentAudio(outputPath);
  }
}

/**
 * Generate a unique filename for TTS audio.
 * @param {number} phraseId
 * @returns {string}
 */
export function ttsFilename(phraseId) {
  return `tts_${phraseId}_${crypto.randomUUID().slice(0, 8)}.mp3`;
}

export default { generateAudio, ttsFilename };
