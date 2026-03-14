# External Integrations

**Analysis Date:** 2026-03-14

## APIs & External Services

**AI Avatar Generation:**
- Kling AI Lip-Sync - Generates talking head videos from face image + audio
  - SDK/Client: Custom implementation using `node-fetch` (`server/services/klingApi.js`)
  - Auth: HS256 JWT tokens signed with `KLING_API_KEY` and `KLING_API_SECRET`
  - Endpoint: `https://api.klingai.com`
  - Methods:
    - `POST /v1/videos/lip-sync` - Submit job (image + audio → video)
    - `GET /v1/videos/lip-sync/{taskId}` - Poll job status
  - Status flow: submitted → processing → succeed/failed
  - Implementation: `server/services/klingApi.js`
  - Used by: `server/services/avatarPipeline.js`, `server/routes/avatars.js`

**Text-to-Speech (TTS):**
- Google Translate TTS (primary/free)
  - Endpoint: `https://translate.google.com/translate_tts`
  - Supports: Twi (tw), Ga (gaa), Ewe (ee), English (en), etc.
  - Language mapping: `server/services/ttsService.js`
  - No authentication required
  - Max 200 characters per request; long text chunked automatically
  - Response: MP3 audio buffer

- Abena AI (coming soon/placeholder)
  - Endpoint: `https://api.abena.mobobi.com/v1/tts` (placeholder)
  - Auth: Bearer token via `ABENA_API_KEY` environment variable
  - Status: Not yet launched; fallback to Google TTS
  - When available: Higher-quality native Twi voices

- Fallback: Silent audio (generates minimal valid MP3)
  - Used when TTS fails or if provider is "silent"

**Implementation:** `server/services/ttsService.js`
**Provider selection:** `TTS_PROVIDER` env var (google | abena | silent)

## Data Storage

**Databases:**
- SQLite 3 (better-sqlite3 11.7.0)
  - Connection: `server/db.js` - Synchronous driver
  - Location: `./okasa.db` (WAL mode enabled for concurrent reads)
  - Foreign keys: Enabled
  - Schema migrations: `server/migrate.js`
  - Seed data: `server/seed.js`
  - Tables:
    - `users` - User authentication (email, password_hash)
    - `profiles` - User profiles (child_name, parent_name, language, avatar_url)
    - `avatars` - Static image avatars (filename, original_name, mime_type, size_bytes)
    - `lessons` - Lesson metadata (slug, name, description, sort_order)
    - `phrases` - Lesson phrases (twi, english, phonetic, emoji, context)
    - `progress` - User lesson progress (completed, score, completed_at)
    - `quiz_responses` - Quiz answer tracking (lesson_id, phrase_id, user_answer, is_correct)
    - `avatar_source_videos` - Parent videos for lip-sync (user_id, filename, frame_filename)
    - `generation_jobs` - Avatar generation job tracking (user_id, source_video_id, total_phrases, status, started_at)
    - `avatar_videos` - Generated avatar videos (user_id, phrase_id, source_video_id, status, kling_task_id, video_url, tts_filename)

**File Storage:**
- Local filesystem only
  - Base directory: `./uploads` (configurable via `UPLOAD_DIR` env var)
  - Subdirectories:
    - `videos/` - User-uploaded parent videos
    - `frames/` - Extracted face frames from videos
    - `tts-audio/` - Generated TTS audio files
    - `avatar-videos/` - Final generated avatar videos
  - Upload middleware: multer 1.4.5 (`server/routes/avatars.js`)
  - Max file size: 50MB video uploads (configurable via `MAX_VIDEO_UPLOAD_MB`)

**Caching:**
- None configured (in-memory job tracking via `avatarPipeline.js` during generation)

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based authentication
  - Implementation: `server/middleware/auth.js`
  - Token format: HS256 JWT signed with `JWT_SECRET`
  - Expiry: 7 days
  - Token storage (client): `localStorage.okasa_token`
  - Token passing: `Authorization: Bearer <token>` header

**Registration/Login:**
- Email + password registration (`POST /api/v1/auth/register`)
- Email + password login (`POST /api/v1/auth/login`)
- Password hashing: bcryptjs 2.4.3 (bcrypt)
- Route: `server/routes/auth.js`

**Auth Middleware:**
- `requireAuth` - Mandatory authentication middleware
- `optionalAuth` - Optional authentication (sets `req.userId` if valid, continues if missing)

## Monitoring & Observability

**Error Tracking:**
- None configured (no Sentry, Rollbar, etc.)

**Logging:**
- morgan 1.10.0 - HTTP request logging (`server/index.js`)
  - Dev mode: "dev" format (concise)
  - Prod mode: "combined" format (Apache CLF)
- console.log for application events (Kling API job submission, TTS generation, etc.)
- Error logging: console.error in route handlers

## CI/CD & Deployment

**Hosting:**
- Railway (mentioned in `.env.example` comments; auto-sets PORT)
- Any Node.js platform (local, Docker, AWS, Heroku, etc.)

**CI Pipeline:**
- None detected (no GitHub Actions, GitLab CI, etc.)

**Deployment Process:**
```bash
npm run build     # Frontend: Vite build → dist/
                  # Server: npm install --production in server/
npm start         # Migrations → Seed → Start Express on PORT (default 3001)
```

## Environment Configuration

**Required env vars:**
- `JWT_SECRET` - JWT signing key (MUST be set in production)
- `KLING_API_KEY` - Kling lip-sync API key
- `KLING_API_SECRET` - Kling lip-sync API secret
- `KLING_API_BASE_URL` - Kling endpoint (default: `https://api.klingai.com`)

**Optional env vars:**
- `PORT` - Server port (default: 3001)
- `DB_PATH` - SQLite database location (default: `./okasa.db`)
- `UPLOAD_DIR` - File upload directory (default: `./uploads`)
- `NODE_ENV` - Environment (development/production)
- `ABENA_API_KEY` - Abena TTS API key (not yet active)
- `TTS_PROVIDER` - TTS service (google | abena, default: google)
- `MAX_VIDEO_UPLOAD_MB` - Max upload size (default: 50)
- `AVATAR_GENERATION_CONCURRENCY` - Parallel Kling calls (default: 2)

**Secrets location:**
- `.env` file in `server/` directory (not committed to git)
- `.env.example` in `server/` provides template

## Security Headers & CORS

**Helmet.js Configuration (`server/index.js`):**
- contentSecurityPolicy (production only):
  - defaultSrc: `'self'`
  - scriptSrc: `'self'`
  - styleSrc: `'self'`, `'unsafe-inline'`, `https://fonts.googleapis.com`
  - fontSrc: `'self'`, `https://fonts.gstatic.com`
  - imgSrc: `'self'`, `data:`, `blob:`
  - connectSrc: `'self'` (API calls only to same origin)
  - mediaSrc: `'self'`, `blob:`, `data:` (local video playback)
  - objectSrc: `'none'`
  - frameSrc: `'none'`
  - baseUri: `'self'`
  - formAction: `'self'`

**CORS Configuration:**
- Production: `cors({ origin: false })` - Same-origin only
- Development: `cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5173"], credentials: true })`

## Rate Limiting

**express-rate-limit Configuration (`server/middleware/rateLimit.js`):**
- Global: 100 requests per 15 minutes per IP
- Auth (register/login): 10 attempts per 15 minutes per IP
- Image upload: 5 uploads per 15 minutes per IP
- Video upload: 3 uploads per 1 hour per IP
- Generation trigger: 2 requests per 1 hour per IP
- Status polling: 60 requests per minute (allows frontend polling every 2-3s)

**Applied to routes:**
- Auth routes: `authLimiter` (`server/routes/auth.js`)
- Avatar upload: `uploadLimiter` (`server/routes/avatars.js`)
- Video upload: `videoUploadLimiter` (`server/routes/avatars.js`)
- Generation start: `generationLimiter` (`server/routes/avatars.js`)
- Status poll: `statusPollLimiter` (`server/routes/avatars.js`)

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected (avatar generation uses synchronous polling, not webhooks)

## Avatar Generation Pipeline

**Flow:**
1. User uploads parent video (`POST /api/v1/avatars/upload-video`)
2. Best face frame extracted via FFprobe (`server/services/frameExtractor.js`)
3. Generation started (`POST /api/v1/avatars/generate`)
4. For each phrase:
   - TTS audio generated (Google Translate or Abena)
   - Kling API lip-sync job submitted with frame + audio
   - Job tracked in `generation_jobs` and `avatar_videos` tables
5. Polling loop (`server/services/avatarPipeline.js`):
   - Every 30 seconds, poll Kling for job status
   - On success: Download video to `./uploads/avatar-videos/`
   - On failure: Retry up to 3 times
6. User polls for progress (`GET /api/v1/avatars/generation-status`)
7. User retrieves avatar videos (`GET /api/v1/avatars/videos`)

**Concurrency Control:**
- `AVATAR_GENERATION_CONCURRENCY` env var (default: 2)
- Limits parallel Kling API calls to avoid rate limiting
- In-memory queue with SQLite state persistence

---

*Integration audit: 2026-03-14*
