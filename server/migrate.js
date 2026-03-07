import db from "./db.js";

console.log("🗄️  Running migrations...\n");

// ── Users table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
console.log("  ✓ users");

// ── Profiles table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    child_name TEXT NOT NULL DEFAULT '',
    parent_name TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'twi',
    avatar_url TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
console.log("  ✓ profiles");

// ── Avatars table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS avatars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
console.log("  ✓ avatars");

// ── Lessons table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    difficulty INTEGER NOT NULL DEFAULT 1,
    world TEXT NOT NULL DEFAULT '',
    bg_grad TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0
  );
`);
console.log("  ✓ lessons");

// ── Phrases table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS phrases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id INTEGER NOT NULL,
    twi TEXT NOT NULL,
    phonetic TEXT NOT NULL DEFAULT '',
    english TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    context TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
  );
`);
console.log("  ✓ phrases");

// ── Progress table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lesson_id INTEGER NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 0,
    completed_at DATETIME DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
    UNIQUE(user_id, lesson_id)
  );
`);
console.log("  ✓ progress");

// ── Quiz submissions table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS quiz_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lesson_id INTEGER NOT NULL,
    phrase_id INTEGER NOT NULL,
    selected_answer TEXT NOT NULL,
    correct BOOLEAN NOT NULL DEFAULT 0,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
    FOREIGN KEY (phrase_id) REFERENCES phrases(id) ON DELETE CASCADE
  );
`);
console.log("  ✓ quiz_submissions");

// ── XP ledger table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS xp_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
console.log("  ✓ xp_ledger");

// ── Create indexes ──
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
  CREATE INDEX IF NOT EXISTS idx_avatars_user ON avatars(user_id);
  CREATE INDEX IF NOT EXISTS idx_phrases_lesson ON phrases(lesson_id);
  CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id);
  CREATE INDEX IF NOT EXISTS idx_progress_lesson ON progress(lesson_id);
  CREATE INDEX IF NOT EXISTS idx_quiz_user ON quiz_submissions(user_id);
  CREATE INDEX IF NOT EXISTS idx_xp_user ON xp_ledger(user_id);
`);
console.log("  ✓ indexes");

// ── Avatar source videos table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS avatar_source_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    video_filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    frame_filename TEXT DEFAULT NULL,
    frame_extracted_at DATETIME DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded',
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
console.log("  ✓ avatar_source_videos");

// ── Avatar videos table (one per user per phrase) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS avatar_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    phrase_id INTEGER NOT NULL,
    source_video_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    kling_task_id TEXT DEFAULT NULL,
    video_filename TEXT DEFAULT NULL,
    audio_filename TEXT DEFAULT NULL,
    duration_ms INTEGER DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (phrase_id) REFERENCES phrases(id) ON DELETE CASCADE,
    FOREIGN KEY (source_video_id) REFERENCES avatar_source_videos(id) ON DELETE CASCADE,
    UNIQUE(user_id, phrase_id)
  );
`);
console.log("  ✓ avatar_videos");

// ── Generation jobs table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS generation_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source_video_id INTEGER NOT NULL,
    total_phrases INTEGER NOT NULL DEFAULT 0,
    completed_phrases INTEGER NOT NULL DEFAULT 0,
    failed_phrases INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at DATETIME DEFAULT NULL,
    completed_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (source_video_id) REFERENCES avatar_source_videos(id) ON DELETE CASCADE
  );
`);
console.log("  ✓ generation_jobs");

// ── Additional indexes for avatar tables ──
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_avatar_source_user ON avatar_source_videos(user_id);
  CREATE INDEX IF NOT EXISTS idx_avatar_videos_user ON avatar_videos(user_id);
  CREATE INDEX IF NOT EXISTS idx_avatar_videos_phrase ON avatar_videos(phrase_id);
  CREATE INDEX IF NOT EXISTS idx_avatar_videos_status ON avatar_videos(status);
  CREATE INDEX IF NOT EXISTS idx_generation_jobs_user ON generation_jobs(user_id);
`);
console.log("  ✓ avatar indexes");

// ── Add avatar_type column to profiles (safe: no-op if exists) ──
try {
  db.exec(`ALTER TABLE profiles ADD COLUMN avatar_type TEXT NOT NULL DEFAULT 'cartoon'`);
  console.log("  ✓ profiles.avatar_type column added");
} catch (e) {
  // Column already exists — safe to ignore
  if (!e.message.includes("duplicate column")) throw e;
  console.log("  ✓ profiles.avatar_type column (already exists)");
}

console.log("\n✅ All migrations completed successfully!");
process.exit(0);
