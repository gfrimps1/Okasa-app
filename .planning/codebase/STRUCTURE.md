# Codebase Structure

**Analysis Date:** 2026-03-14

## Directory Layout

```
okasa app/
├── src/                        # React frontend (Vite)
│   ├── main.jsx               # Entry point: mounts App to #root
│   ├── App.jsx                # Single component with all pages + state
│   └── api.js                 # Fetch-based API client wrapper
│
├── server/                     # Express.js backend
│   ├── index.js               # Main server file, route mounting, security config
│   ├── db.js                  # Better SQLite3 connection setup
│   ├── migrate.js             # Database schema creation
│   ├── seed.js                # Populate lessons/phrases (idempotent)
│   │
│   ├── middleware/            # Cross-cutting middleware
│   │   ├── auth.js            # JWT signing/verification (signToken, requireAuth, optionalAuth)
│   │   ├── validate.js        # Input sanitization + validation rules
│   │   └── rateLimit.js       # Express rate limiters (global, auth, upload)
│   │
│   ├── routes/                # API endpoint handlers
│   │   ├── auth.js            # POST /register, /login; GET /me
│   │   ├── profiles.js        # GET/PUT /profiles/me
│   │   ├── lessons.js         # GET /lessons, /lessons/:slug
│   │   ├── progress.js        # GET/POST /progress (XP tracking)
│   │   ├── quiz.js            # POST /quiz/submit, GET /quiz/history/:slug
│   │   └── avatars.js         # POST /upload (image), /upload-video, /generate; GET /generation-status, /videos, /video/:phraseId, /audio/:phraseId
│   │
│   ├── services/              # Business logic & external integrations
│   │   ├── avatarPipeline.js  # Orchestrates TTS → Kling → download job flow
│   │   ├── ttsService.js      # Text-to-speech using Google Translate API
│   │   ├── frameExtractor.js  # Extract best frame from source video (ffprobe + FFmpeg)
│   │   └── klingApi.js        # Kling lip-sync API client (submit task, poll, download)
│   │
│   ├── uploads/               # Generated and uploaded files (git-ignored)
│   │   ├── videos/            # Raw parent videos (temporary)
│   │   ├── frames/            # Extracted best frames from source videos
│   │   ├── tts-audio/         # Generated speech audio (Google TTS)
│   │   └── avatar-videos/     # Final lip-synced videos from Kling
│   │
│   ├── okasa.db               # SQLite database file (git-ignored)
│   ├── okasa.db-shm           # SQLite WAL shared memory (temporary)
│   ├── okasa.db-wal           # SQLite WAL log (temporary)
│   │
│   ├── package.json           # Server dependencies (Express, SQLite, TTS, video processing)
│   └── .env                   # Environment secrets (git-ignored, use .env.example)
│
├── dist/                      # Production build output (git-ignored)
│   ├── index.html             # SPA entry
│   ├── assets/                # Bundled JS/CSS
│   └── ...
│
├── node_modules/              # Frontend dependencies (git-ignored)
├── .git/                      # Version control
├── .planning/                 # GSD documentation
│   └── codebase/
│       ├── ARCHITECTURE.md
│       └── STRUCTURE.md (this file)
│
├── index.html                 # Frontend HTML template (Vite serves during dev, copied to dist for prod)
├── vite.config.js             # Vite build config (React plugin, /api proxy to localhost:3001)
├── package.json               # Frontend dependencies (React, Vite)
├── .node-version              # Node.js version hint
├── .gitignore                 # Excludes node_modules, .env, uploads/, dist/, okasa.db*
│
├── start-dev.sh               # Dev script (runs vite + server watch)
├── PRD.md                     # Product requirements document
└── SECURITY_PLAYBOOK.md       # Security guidelines
```

## Directory Purposes

**`src/`:**
- Purpose: React single-page application source code
- Contains: JSX/JS files for components, API client logic, theme/color constants, lesson definitions
- Key files: `App.jsx` (1671 lines, main UI component with state), `api.js` (fetch wrapper), `main.jsx` (React mount)
- Note: Currently monolithic; no folder structure within src/ — all code in root

**`server/`:**
- Purpose: Node.js Express backend, database, services, file uploads
- Contains: Route handlers, middleware, business logic services, database connection, file upload directories
- Separate package.json with own dependencies (Express, SQLite, bcryptjs, FFmpeg tools, etc.)

**`server/middleware/`:**
- Purpose: Request processing pipeline and security enforcement
- Contains: JWT auth, input validation rules, rate limit configurations
- Key files: `auth.js` (signToken, requireAuth), `validate.js` (sanitize, isValidName, isValidEmail), `rateLimit.js` (global, auth, upload limiters)

**`server/routes/`:**
- Purpose: HTTP endpoint handlers organized by resource type
- Contains: One router per resource (auth, profiles, lessons, progress, quiz, avatars)
- Pattern: Each exports an Express Router, mounted in index.js as `/api/v1/{resource}`
- No middleware composition within files — middleware applied during mount in index.js

**`server/services/`:**
- Purpose: Encapsulated business logic and external integrations
- Contains: Avatar generation pipeline, TTS generation, video processing, Kling API client
- Key files: `avatarPipeline.js` (orchestrates multi-step job workflow), `ttsService.js` (Google TTS), `frameExtractor.js` (FFmpeg video processing)

**`server/uploads/`:**
- Purpose: Persistent storage for user-generated and generated files
- Subdirectories: `videos/` (raw uploads), `frames/` (extracted), `tts-audio/` (generated speech), `avatar-videos/` (final output)
- File naming: UUIDs for uniqueness (e.g., `vid_<uuid>.mp4`, `tts_<phraseId>_<uuid>.mp3`)
- Served by: Express static middleware, accessed via GET `/api/v1/avatars/video/:phraseId` and `/audio/:phraseId`

**`dist/`:**
- Purpose: Production build output from Vite
- Generated by: `npm run build` (runs Vite bundler)
- Served by: Express static middleware in production (when NODE_ENV=production)
- Contains: Minified HTML/CSS/JS, asset hashing for cache busting

## Key File Locations

**Entry Points:**

| File | Purpose |
|------|---------|
| `index.html` | SPA template with CSP headers, root div, Vite script injection |
| `src/main.jsx` | React root render point |
| `src/App.jsx` | Main component, holds all pages, routes, state (1671 lines) |
| `server/index.js` | Express app setup, middleware mounting, port 3001 listener |

**Configuration:**

| File | Purpose |
|------|---------|
| `package.json` | Frontend scripts: dev (Vite), build, preview |
| `server/package.json` | Backend scripts: start, dev (--watch), migrate, seed |
| `vite.config.js` | Vite build config, /api proxy to localhost:3001 |
| `server/.env` | Environment variables (SECRETS — never commit) |
| `server/.env.example` | Template for required env vars (safe to commit) |
| `.node-version` | Node version requirement (20.19.0+) |
| `index.html` | CSP meta tags, security headers |

**Core Logic:**

| File | Purpose |
|------|---------|
| `src/api.js` | Fetch client, JWT token lifecycle, all API endpoints |
| `server/db.js` | SQLite connection, WAL mode, FK constraints |
| `server/migrate.js` | Schema creation (idempotent, runs before seed) |
| `server/seed.js` | Populate lessons/phrases data (idempotent) |

**Authentication:**

| File | Purpose |
|------|---------|
| `server/middleware/auth.js` | `signToken(userId)`, `requireAuth` middleware, JWT verification |
| `server/routes/auth.js` | POST `/register`, `/login` (hash password, create user) |
| `src/api.js` | `register()`, `login()` functions, token storage in localStorage |

**Avatar Generation:**

| File | Purpose |
|------|---------|
| `server/routes/avatars.js` | POST `/upload-video`, POST `/generate`, GET `/generation-status` |
| `server/services/avatarPipeline.js` | Job orchestration, batch processing, polling loop |
| `server/services/frameExtractor.js` | Extract best frame using ffprobe + FFmpeg |
| `server/services/ttsService.js` | Generate speech using Google Translate API |
| `server/services/klingApi.js` | Call Kling lip-sync API, poll task status, download result |

**Testing & Build:**

| File | Purpose |
|------|---------|
| `start-dev.sh` | Development launcher (concurrent vite + server --watch) |
| `vite.config.js` | Dev server config with /api proxy, React plugin |

## Naming Conventions

**Files:**
- Frontend: PascalCase for components (App.jsx), camelCase for utilities (api.js)
- Backend: camelCase for all modules (index.js, db.js, avatarPipeline.js, ttsService.js)
- Utilities: camelCase with descriptive names (frameExtractor.js, rateLimit.js)
- Environment: UPPERCASE_SNAKE_CASE (UPLOAD_DIR, JWT_SECRET, API_BASE)

**Directories:**
- Lowercase plural nouns: `src/`, `server/`, `routes/`, `services/`, `middleware/`, `uploads/`
- Subdirectories: `server/routes/`, `server/services/`, `server/uploads/`

**Database:**
- Tables: snake_case (users, profiles, lessons, phrases, progress, quiz_submissions, avatar_source_videos)
- Columns: snake_case (user_id, created_at, phone_number)
- Foreign keys: {table}_id format (user_id, lesson_id, phrase_id)

**API Routes:**
- Resource-based: `/api/v1/{resource}/{action}`
- Examples: `/api/v1/auth/register`, `/api/v1/profiles/me`, `/api/v1/avatars/generate`
- Verbs: POST for create/update, GET for fetch, PUT for replace

**Variables & Functions:**
- camelCase for all (userId, authToken, startGeneration, generateAudio)
- Constants: UPPERCASE_SNAKE_CASE (API_BASE, UPLOAD_DIR, CONCURRENCY, POLL_INTERVAL_MS)
- Booleans: is* or has* prefix (isValidEmail, isProcessing, hasMorePending)
- Promise functions: use async/await, no callback-style naming

**CSS & Theme:**
- Token-based: C.sunYellow, C.coral, C.mint (defined in App.jsx)
- FX object: glassBg, glassBlur, cardShadow (design tokens, some from CSS custom properties)
- Sizing: Use semantic aliases (control=16, card=20, panel=28)

## Where to Add New Code

**New Feature (e.g., new lesson type or quiz mode):**
- Frontend state/UI: Add to `src/App.jsx` (component, useState, handler functions)
- API endpoint: Create new route in `server/routes/` (e.g., `server/routes/gamification.js`)
- Service logic: If complex, extract to `server/services/` (e.g., `server/services/gamificationEngine.js`)
- Tests: Currently no test files — would go alongside source files (e.g., `app.test.jsx`, `gamification.test.js`)

**New External Integration (API, service, database):**
- Client wrapper: Add function to `src/api.js` (e.g., `export async function getExternalData()`)
- Backend handler: Create route in appropriate `server/routes/` file or new route file
- Service layer: If it involves orchestration, create `server/services/{name}.js` (e.g., `analyticsPipeline.js`)
- Env config: Add keys to `server/.env` and `.env.example`
- Error handling: Wrap external calls in try/catch, fallback gracefully

**New Database Table/Entity:**
- Schema: Add CREATE TABLE to `server/migrate.js` with proper indexes
- Data: Add seed logic to `server/seed.js` if it needs initial data
- Routes: Create new route file in `server/routes/` for CRUD operations
- Queries: Use db.prepare() with parameterized statements to prevent SQL injection

**Shared Utilities:**
- Input validation: Add to `server/middleware/validate.js` (e.g., `isValidCategory()`)
- API helpers: Add to `src/api.js` (e.g., `export function buildQueryString()`)
- Constants: Define in `src/App.jsx` (frontend) or at top of `server/index.js` (backend)

**Middleware (auth, rate limit, logging):**
- Location: `server/middleware/{purpose}.js`
- Pattern: Export function(s) that return Express middleware or utility functions
- Examples: `requireAuth(req, res, next)`, `validateBody(rules)`, `authLimiter` from express-rate-limit
- Usage: Import in `server/index.js` for global, or in specific route files

## Special Directories

**`server/uploads/`:**
- Purpose: Stores all user-generated and system-generated files
- Generated: Yes — created by multer (image/video uploads) and services (extracted frames, TTS audio, avatar videos)
- Committed: No — `.gitignore` excludes this directory
- Size: Can grow unbounded — production should migrate to cloud storage (S3, GCS)
- Cleanup: No automatic cleanup — stale files in `videos/` subdirectory after processing should be managed manually

**`dist/`:**
- Purpose: Production JavaScript/CSS bundles
- Generated: Yes — `npm run build` creates this directory
- Committed: No — regenerate on each deployment
- Contents: index.html, assets/ (bundled JS/CSS with hashes), manifest files

**`server/node_modules/`:**
- Purpose: Backend dependencies
- Generated: Yes — `npm install` in server/ directory
- Committed: No — regenerate with package-lock.json

**`.planning/codebase/`:**
- Purpose: GSD documentation (this file and ARCHITECTURE.md)
- Generated: Yes — created by `/gsd:map-codebase` command
- Committed: Yes — these are reference documents for future work
- Contents: Architecture overview, structure guide, conventions, testing patterns, concerns

---

*Structure analysis: 2026-03-14*
