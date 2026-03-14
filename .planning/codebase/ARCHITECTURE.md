# Architecture

**Analysis Date:** 2026-03-14

## Pattern Overview

**Overall:** Full-stack monorepo with client-server separation using Express backend and React frontend, connected via REST API.

**Key Characteristics:**
- **Separation of concerns:** Frontend (React) and backend (Node.js/Express) in separate package.json environments
- **API-first design:** All frontend-backend communication through `/api/v1` REST endpoints
- **Database-driven lessons:** Curriculum stored in SQLite, seeded at startup
- **Async job pipeline:** Avatar generation uses in-memory polling with SQLite durable state
- **Security-forward:** Input validation on both frontend and server, JWT authentication, rate limiting, CSP headers

## Layers

**Presentation (Frontend):**
- Purpose: User interface rendered in React, handles auth state, lesson navigation, quiz interaction, avatar upload flows
- Location: `src/`
- Contains: Single-page application with stateful components (App.jsx), API client wrapper (api.js), secure input handling
- Depends on: `/api/v1` backend endpoints, localStorage for JWT token persistence
- Used by: Browser, Vite dev server (port 5173) or production build output

**API Gateway (Express Server):**
- Purpose: Route HTTP requests to appropriate handlers, enforce security middleware, serve static production assets
- Location: `server/index.js`
- Contains: Helmet security headers, CORS configuration, Morgan logging, global rate limiter, route mounting
- Depends on: All route modules under `server/routes/`, services under `server/services/`
- Used by: Frontend via fetch() calls, health checks, file uploads

**Route Handlers:**
- Purpose: Handle HTTP verbs for specific resource types
- Location: `server/routes/` - auth.js, profiles.js, lessons.js, progress.js, avatars.js, quiz.js
- Contains: Request validation, database queries, response formatting
- Depends on: Middleware (auth, validation, rate limits), database (db.js), services
- Used by: Express app via `app.use("/api/v1/...", routes)`

**Services (Business Logic):**
- Purpose: Encapsulate complex operations like TTS generation, video processing, external API calls
- Location: `server/services/` - avatarPipeline.js, ttsService.js, frameExtractor.js, klingApi.js
- Contains: Orchestration of multi-step workflows, external integrations, file I/O
- Depends on: ffmpeg/ffprobe binaries, Google Translate TTS, Kling AI API, fs/path utilities
- Used by: Route handlers and the polling loop timer

**Middleware:**
- Purpose: Cross-cutting concerns for request processing
- Location: `server/middleware/` - auth.js, rateLimit.js, validate.js
- Contains: JWT signing/verification, input sanitization, request rate limiting rules
- Depends on: jsonwebtoken, express-rate-limit, built-in Node validation
- Used by: Route handlers as middleware in Express chain

**Data Persistence:**
- Purpose: Structured storage for users, lessons, progress, avatars
- Location: `server/db.js` (Better SQLite3 connection), `server/okasa.db` (SQLite database file)
- Contains: Tables for users, profiles, lessons, phrases, progress, quiz_submissions, xp_ledger, avatar jobs, source videos
- Depends on: Better SQLite3 library, manual migration/seed scripts
- Used by: All route handlers and services via prepared statements

**Database Schema (Core Tables):**
- `users` → `profiles` (1:1) — User accounts and tutor configuration
- `lessons` → `phrases` (1:N) — Curriculum structure
- `progress` (N:N between users and lessons) — Completion tracking and XP awards
- `quiz_submissions` — Detailed answer history per phrase
- `avatar_source_videos` → `avatar_videos` (1:N) — AI avatar generation job state
- `xp_ledger` (append-only) — Points history for auditing

## Data Flow

**Authentication Flow:**

1. User submits email/password → POST `/api/v1/auth/register` or `/login`
2. Server validates input (length, format, bcryptjs hashing)
3. Server creates user record in `users` table, auto-creates empty profile
4. Server signs JWT token with userId claim (7-day expiry)
5. Frontend receives token, stores in localStorage as `okasa_token`
6. Subsequent requests include `Authorization: Bearer <token>` header
7. Server middleware (`requireAuth`) verifies token or rejects with 401

**Lesson Loading Flow:**

1. Frontend calls GET `/api/v1/lessons`
2. Server queries `lessons` table (sorted by `sort_order`) and `phrases` table
3. Server groups phrases by lesson_id, formats response
4. Frontend receives flat list of lessons with nested phrases
5. Frontend displays lessons as cards; on click, fetches GET `/api/v1/lessons/:slug` for detail view

**Avatar Generation Pipeline:**

1. User uploads parent video → POST `/api/v1/avatars/upload-video`
2. Server validates video (codec, duration, resolution using ffprobe)
3. Server extracts best frame (highest brightness/face detection) using FFmpeg
4. Server saves source video record with `status='processing'`, stores frame in `uploads/frames/`
5. Frontend polls GET `/api/v1/avatars/generation-status` while "Processing..." UI shows
6. User clicks "Start Generation" → POST `/api/v1/avatars/generate` with sourceVideoId
7. Backend service `startGeneration()` creates job record, queues all phrases:
   - For each phrase: Generate TTS audio using Google Translate API → save to `uploads/tts-audio/`
   - Submit frame + audio to Kling lip-sync API → get back task ID
   - Poll Kling task status every 30 seconds via `pollTaskStatus()`
   - Download generated video from Kling → save to `uploads/avatar-videos/`
8. Frontend streaming status: GET `/api/v1/avatars/generation-status` returns `{ completed_phrases, total_phrases }`
9. Lessons now playable with AI avatar videos from `uploads/avatar-videos/`

**Progress & Scoring:**

1. User completes quiz → POST `/api/v1/quiz/submit` with answers
2. Server checks each answer against phrase data
3. Server calculates score (0-100), saves to progress and quiz_submissions
4. Server awards XP (10 base, +5 bonus for score ≥ 80)
5. POST `/api/v1/progress` updates progress record and inserts into xp_ledger
6. Frontend fetches GET `/api/v1/progress` to update UI (progress bar, total XP)

**State Management:**

- **Frontend state:** React useState/useCallback for UI (theme, modal visibility, form inputs), localStorage for token
- **Backend state:** SQLite for persistent records (users, lessons, progress), in-memory for avatar generation job tracking with setInterval polling, file system for uploaded assets
- **Job queue:** No external queue (e.g., Bull, BullMQ) — polling loop in `startPollingLoop()` checks avatar_videos status every 30 seconds and progresses pending → generating → complete

## Key Abstractions

**API Client (`src/api.js`):**
- Purpose: Centralized fetch wrapper with JWT token management
- Pattern: Function-based exports (register, login, getMe, getProgress, etc.) that handle Content-Type, Authorization headers, 401 token expiry
- Examples: `export async function login(email, password)` — sets token in localStorage, returns user
- Why abstracted: Prevents duplicate header logic, centralizes token refresh strategy, allows swapping HTTP client later

**Input Sanitization (`server/middleware/validate.js` + `src/App.jsx`):**
- Purpose: Defense-in-depth against injection attacks — client-side prevention + server-side enforcement
- Pattern: Both layers strip zero-width characters, RTL overrides, HTML/JS syntax, enforce max lengths, normalize Unicode NFC
- Examples: `sanitizeInput(str, 30)` removes `<>"'` and \u200B-\u202E (homoglyph attacks)
- Why abstracted: XSS protection, data validation reuse, prevents inconsistency between client validation and server

**Rate Limiting (server/middleware/rateLimit.js):**
- Purpose: Prevent abuse on auth endpoints, uploads, avatar generation polling
- Pattern: express-rate-limit with configurable windows (15 requests per 15min on auth, stricter on uploads)
- Used by: `/auth` routes (authLimiter), `/avatars/upload*` routes (uploadLimiter), global limiter on all `/api` routes
- Why abstracted: Centralized rate limit config, consistent DX, easy to adjust by environment

**Avatar Pipeline Orchestration (server/services/avatarPipeline.js):**
- Purpose: Multi-step async workflow: TTS → Kling submission → polling → download
- Pattern: Job-based state tracking in `generation_jobs` and `avatar_videos` tables, in-memory setInterval polling every 30 seconds
- Components:
  - `startGeneration(userId, sourceVideoId)` — creates job, queues phrases
  - `processNextBatch(jobId)` — batch processor with concurrency limit (default 2)
  - `checkJobCompletion(jobId)` — marks job done when all phrases complete
  - `startPollingLoop()` — background setInterval that runs continuously
- Why abstracted: Separates job orchestration from API request handling, allows pausing/resuming jobs across server restarts, centralizes error handling

## Entry Points

**Frontend Entry:**
- Location: `src/main.jsx`
- Triggers: Browser load of `index.html` (production served from `server/index.js`, dev from Vite)
- Responsibilities: Mounts React to DOM, renders `<OkasaApp />`

**Backend Entry:**
- Location: `server/index.js`
- Triggers: `npm start` or `node index.js` on port 3001
- Responsibilities: Initialize Express, mount routes, ensure upload directories exist, start avatar polling loop

**Database Initialization:**
- Location: `server/migrate.js` (run on startup)
- Triggers: Called in package.json start script before index.js
- Responsibilities: Create all tables with proper indexes, enable WAL mode, enable foreign keys

**Data Seeding:**
- Location: `server/seed.js`
- Triggers: Called in start script after migrate.js
- Responsibilities: Populate lessons and phrases if tables are empty (idempotent, checks for existing data)

## Error Handling

**Strategy:** Server-side centralized error handler catches uncaught exceptions, logs to console, returns JSON error message. Frontend wraps fetch calls in try/catch, handles specific status codes (401 for re-auth, 5xx for user message).

**Patterns:**
- **Auth errors:** 401 returned, frontend `clearAuth()` to logout and redirect
- **Validation errors:** 400 with `{ error, details: [{ field, message }] }`
- **Upload errors:** 400 for multer errors (size, format), descriptive error message
- **Avatar generation:** Failed avatar_videos record status='failed' with error_message, job continues processing other phrases
- **External API failures (TTS, Kling):** Wrapped in try/catch with fallback (silent audio for TTS, mark video failed for Kling), logged to console
- **Database errors:** 500 with generic "Internal server error" message (no leaking of SQL details)

## Cross-Cutting Concerns

**Logging:** Morgan middleware logs HTTP requests (combined format in prod, dev in dev). Services log to console with emoji prefixes (🔊 for TTS, 🎬 for avatar jobs, ❌ for errors).

**Validation:**
- Frontend: Real-time input validation with `isValidName()`, `sanitizeInput()` as user types
- Server: Middleware `validateBody()` enforces rules before reaching route handler, returns 400 with field-specific errors
- Database: Foreign key constraints, unique indexes on (user_id, lesson_id) for progress

**Authentication:**
- Frontend: localStorage token persistence, automatic Authorization header injection in api.js
- Server: JWT middleware requireAuth extracts and verifies token, attaches req.userId
- Expiry: 7-day token lifetime, no refresh token (would require additional table)

**Rate Limiting:**
- Global: 100 requests per 15 minutes on all `/api` routes
- Auth-specific: 5 attempts per 15 minutes on login/register (prevent brute force)
- Upload-specific: 10 uploads per 15 minutes (prevent storage exhaustion)

---

*Architecture analysis: 2026-03-14*
