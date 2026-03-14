# Codebase Concerns

**Analysis Date:** 2026-03-14

## Tech Debt

**Monolithic Frontend Component:**
- Issue: `src/App.jsx` is 1,671 lines in a single component with 10+ top-level useEffect hooks managing auth, video upload, avatar generation polling, quiz state, and progress tracking.
- Files: `src/App.jsx`
- Impact: Difficult to maintain, test, and debug. State management is implicit and scattered across multiple useState calls. Changes to one feature risk breaking others.
- Fix approach: Extract into smaller composable components (LessonScreen, AvatarUploadScreen, QuizScreen) with extracted hooks (useAvatarGeneration, useLessonProgress). Use a simple state machine (Xstate or reducer) to manage screen transitions instead of scattered if-statements.

**Server Polling Without Queue:**
- Issue: Avatar generation pipeline uses `setInterval` and `setTimeout` (no external queue system) for orchestration. In-memory state tracked in isProcessing flag and database.
- Files: `server/services/avatarPipeline.js` (lines 101, 214, 257, 394, 399)
- Impact: No persistence of jobs between server restarts. If Kling API hangs, job can stall (though attempts counter prevents infinite loops). Concurrent requests on separate instances will duplicate work.
- Fix approach: Migrate to Bull/BullMQ or similar Redis-backed queue with persistent job records. For single-instance Railway, acceptable as stopgap but will fail on production scale or multi-instance deployment.

**Missing Environment Variable Validation:**
- Issue: Several critical env vars are checked at runtime with fallbacks (JWT_SECRET defaults to "okasa-dev-secret", TTS_PROVIDER defaults to "google"). No startup validation that required secrets exist in production.
- Files: `server/index.js`, `server/middleware/auth.js`, `server/services/ttsService.js`, `server/services/klingApi.js`
- Impact: If JWT_SECRET isn't set in production, defaults to insecure dev secret. Kling/TTS features silently degrade instead of failing fast.
- Fix approach: Add startup check in `server/index.js` that validates NODE_ENV !== "production" allows defaults, otherwise throws and exits. Document required secrets.

**No Request Timeout on Kling API:**
- Issue: Fetch calls to Kling API in `server/services/klingApi.js` have no AbortController timeout.
- Files: `server/services/klingApi.js` (lines 40-50 klingFetch function)
- Impact: If Kling servers hang, pollingTimer setInterval can accumulate pending requests indefinitely, eventually exhausting memory.
- Fix approach: Add AbortController with 30-second timeout to all klingFetch calls. Handle timeout errors by marking job as failed and advancing to next batch.

**Avatar Pipeline Doesn't Handle Kling Rate Limits:**
- Issue: CONCURRENCY setting controls parallel submissions but code doesn't parse Kling's 429 rate limit response or implement exponential backoff.
- Files: `server/services/avatarPipeline.js` (line 18: CONCURRENCY), `server/services/klingApi.js` (pollTaskStatus, submitLipSync)
- Impact: On production scale with CONCURRENCY > 1, Kling API will reject requests, marking phrases as failed when they should be retried after backoff.
- Fix approach: Parse 429 responses in klingFetch. Implement exponential backoff with jitter. Reduce CONCURRENCY to 1 for Railway free tier.

---

## Known Bugs

**Avatar Generation Stuck at 0% (Partially Fixed):**
- Symptoms: Job shows 0% progress even though TTS is generating and Kling tasks are submitted. Frontend polling shows no completed_phrases count increment.
- Files: `server/services/avatarPipeline.js` (line 177: completed_phrases increment), `src/App.jsx` (lines 629-631: polling logic)
- Trigger: Recent commit d2b3749 added batch continuation logic, but database counter may not increment properly if job status changes race with polling loop.
- Workaround: Refresh page to poll from fresh state. Backend will resume processing from database.

**Video Upload Not Using Limiter in Routes File:**
- Issue: `server/routes/avatars.js` imports uploadLimiter but the /upload-video endpoint doesn't use videoUploadLimiter, allowing bypass of per-hour rate limit.
- Files: `server/routes/avatars.js` (lines 12, 125-126 uses uploadLimiter instead of videoUploadLimiter)
- Impact: User can spam video uploads to fill server disk despite rate limit middleware existing.
- Workaround: None — endpoint is vulnerable.

**Memory Leak in Avatar Pipeline Polling:**
- Issue: `startPollingLoop()` creates a setInterval that never clears pending/suspended promises. If Kling API stalls, pollKlingTasks awaits accumulate without cleanup.
- Files: `server/services/avatarPipeline.js` (lines 399-411)
- Impact: Long-running server can exhaust memory on high-concurrency avatar jobs.
- Workaround: Restart server gracefully during low-traffic windows. Reduce CONCURRENCY.

**No Cleanup of Failed TTS/Kling Files:**
- Issue: When avatar generation fails, audio files in `/uploads/tts-audio/` and videos in `/uploads/avatar-videos/` are not cleaned up.
- Files: `server/services/avatarPipeline.js` (no cleanup logic), `server/routes/avatars.js` (success path only)
- Impact: Disk fills up with orphaned media from failed jobs.
- Workaround: Manually delete failed files via SSH. Add cron job to clean files older than 7 days.

---

## Security Considerations

**JWT Secret Hardcoded Default:**
- Risk: Production deployments that forget to set JWT_SECRET will use "okasa-dev-secret" (plaintext in code), allowing token forgery.
- Files: `server/middleware/auth.js` (line 6)
- Current mitigation: .env.example documents this, but no server-side validation prevents dev secret in production.
- Recommendations: Require JWT_SECRET in production. Throw error at startup if NODE_ENV === "production" and JWT_SECRET === default.

**Multer Storage on Shared Filesystem:**
- Risk: Avatar videos, frames, and generated videos stored on disk accessible to any process. No encryption at rest.
- Files: `server/routes/avatars.js` (lines 24-30), `server/services/avatarPipeline.js` (line 17)
- Current mitigation: File names are randomized with crypto.randomUUID(). Served via /api/v1/avatars/:filename with no auth check on GET.
- Recommendations: Add requireAuth to avatar file serving routes. Consider S3 pre-signed URLs for generated videos. Encrypt TTS audio at rest.

**No CSRF Protection on API:**
- Risk: React app makes unguarded POST requests. Form-based CSRF attacks possible if user is tricked into visiting malicious site while authenticated.
- Files: `server/index.js` (no CSRF middleware), `src/api.js` (all POST requests)
- Current mitigation: Bearer token auth requires Authorization header (browsers won't auto-include on cross-origin requests), but POST form could potentially bypass.
- Recommendations: Add CSRF token for state-changing endpoints (profile updates, generation start). Current token-based design is reasonably safe but document this assumption.

**Rating Limits Are IP-Based, Not User-Based:**
- Risk: Multiple users on same corporate network or VPN share rate limit bucket, allowing one user to DoS others.
- Files: `server/middleware/rateLimit.js` (all limiters use default IP detection)
- Current mitigation: Trust-proxy config not set, so only direct IP counted (safe on Railway).
- Recommendations: For shared networks, use user ID from JWT token as rate limit key instead of IP. Document current IP-based approach.

**Generation Job Status Not Validated on Resume:**
- Risk: If database is corrupted or job record modified, resumeableJobs could re-process completed jobs.
- Files: `server/services/avatarPipeline.js` (lines 385-395)
- Current mitigation: Job status checked as "processing" and individual avatar_videos status checked before reprocessing.
- Recommendations: Add checksums or version numbers to job records to detect corruption. Log resumed jobs for audit.

---

## Performance Bottlenecks

**Blocking Video Frame Extraction:**
- Problem: `server/services/frameExtractor.js` uses ffmpeg synchronously to extract frames during upload request. Large videos block request handler for 10+ seconds.
- Files: `server/routes/avatars.js` (POST /upload-video), `server/services/frameExtractor.js`
- Cause: ffmpeg frame extraction is CPU-intensive, runs inline during request instead of queued.
- Improvement path: Offload to background task. Return 202 Accepted with job ID, poll status via separate endpoint. Or pre-compute low-res preview during upload validation.

**Full Scan of All Phrases Per Generation:**
- Problem: Avatar generation job loads all phrases from DB (`SELECT * FROM phrases`) and creates avatar_videos for each, even if only specific lesson phrases needed.
- Files: `server/services/avatarPipeline.js` (lines 57-59)
- Cause: No filtering by lesson_id, so every user generates videos for all 100+ phrases in database.
- Improvement path: Add lesson_id to generation_jobs, filter phrases by lesson. Reduces TTS calls and Kling submissions by 10x.

**App.jsx Renders All Screens Simultaneously:**
- Problem: Component renders lesson screens, quiz screens, progress screens all at once, only hiding via display:none CSS.
- Files: `src/App.jsx` (screen-based if-statements return full JSX trees)
- Cause: React can't code-split or lazy-load screens since they're all in single bundle.
- Improvement path: Use React.lazy() and Suspense for screen components. Reduces initial bundle size and improves perceived startup time.

**No Pagination on Lesson Phrases:**
- Problem: Lesson detail loads all phrases at once (can be 20-50 per lesson), renders each with full event handlers.
- Files: `src/App.jsx` (lesson screen iteration), `server/routes/lessons.js` (GET /lessons/:id)
- Cause: UI shows all phrases in scrollable list instead of paging or virtualization.
- Improvement path: Implement virtual scrolling (react-window) or paginate to 10 phrases per page. Reduces DOM nodes for large lessons.

**Database Unindexed Queries in Progress Endpoints:**
- Problem: `server/routes/progress.js` queries progress and quiz submissions without filtering by lesson_id first (reads entire tables).
- Files: `server/routes/progress.js`, `server/migrate.js` (index creation)
- Cause: Progress lookups assume small dataset; scales poorly at 100K+ users.
- Improvement path: Add compound index on (user_id, lesson_id). Query planner will use index for user+lesson lookups.

---

## Fragile Areas

**Avatar Generation Batch Processing:**
- Files: `server/services/avatarPipeline.js` (processNextBatch function, lines 104-217)
- Why fragile: Batch has 7-step pipeline (check job, fetch pending, read frame, generate TTS, submit Kling, poll status, download) with no explicit transaction boundaries. If process crashes between steps, job state becomes inconsistent.
- Safe modification: Wrap each phase in savepoint transactions. Test with intentional crashes between steps.
- Test coverage: No unit tests for avatarPipeline. Manual testing only.

**Kling API Integration:**
- Files: `server/services/klingApi.js` (all functions)
- Why fragile: Tight coupling to Kling API response format (task_status, task_result.videos, task_result.videos[0].url). Single field rename in Kling API response breaks generation.
- Safe modification: Add response schema validation before accessing nested fields. Use optional chaining (result?.data?.videos?.[0]?.url). Document Kling API contract.
- Test coverage: No mocks for Kling API. Integration tests would break if Kling API unavailable.

**JWT Token Validation Middleware:**
- Files: `server/middleware/auth.js` (requireAuth function)
- Why fragile: No try-catch around jwt.verify(). Malformed token causes 500 error instead of 401 Unauthorized.
- Safe modification: Wrap jwt.verify in try-catch, return 401 on decode failure. Add unit test with invalid tokens.
- Test coverage: No auth tests.

**React State Machine in App.jsx:**
- Files: `src/App.jsx` (screen state, 10+ useEffect dependencies)
- Why fragile: State transitions based on screen string ("splash" → "auth" → "welcome" → "dashboard" → "lesson") with no validation. Typo in screen name silently breaks navigation.
- Safe modification: Use TypeScript enum for screen states. Or use reducer with explicit transitions. Add invariant() assertions for invalid transitions.
- Test coverage: No unit tests. Manual smoke testing only.

---

## Scaling Limits

**SQLite Database on Disk:**
- Current capacity: okasa.db ~128KB, okasa.db-wal ~511KB (March 13 state). Supports ~10K users before query latency issues.
- Limit: SQLite locks entire database on write (worse with WAL mode). Multiple concurrent video uploads or avatar generations will queue requests and slow down.
- Scaling path: Migrate to PostgreSQL with connection pooling (pgbouncer). No code changes needed if using same SQL dialect. Supports 100K+ concurrent users.

**In-Memory Job Tracking:**
- Current capacity: isProcessing flag tracks single batch. If 100 users trigger generation simultaneously, setInterval polling will queue and eventually exhaust heap.
- Limit: JavaScript event loop becomes bottleneck at 1000+ concurrent jobs.
- Scaling path: Move to Redis Bull queue (mentioned in Tech Debt). Allows horizontal scaling across multiple Node processes.

**Disk Storage for Uploaded Videos:**
- Current capacity: Unlimited (depends on Railway dyno storage quota, typically 512MB).
- Limit: Videos are 5-50MB each; 10 users = 100-500MB consumed. After quota exceeded, uploads fail silently.
- Scaling path: Upload to S3 or Cloudinary instead of local disk. Implement s3 multipart upload for large videos. Add storage quota per user.

**Kling API Concurrency:**
- Current capacity: CONCURRENCY=2 submits 2 lip-sync tasks per interval. Kling free tier likely 10-20 concurrent tasks.
- Limit: At 5+ users generating simultaneously, Kling 429 rate limit will reject requests (no backoff implemented).
- Scaling path: Implement exponential backoff. Negotiate higher Kling API rate limit or upgrade tier. Implement task queuing with priority.

---

## Dependencies at Risk

**@ffmpeg-installer/ffmpeg (1.1.0):**
- Risk: FFmpeg binary must be present and executable on deployment system. Railway pre-installed binary may differ from local dev environment.
- Impact: Video upload validation (ffprobe) fails silently if ffmpeg not found. Recent fix (commit 1ed6dcc) installed @ffprobe-installer but doesn't validate at startup.
- Migration plan: Add startup check: run `ffprobe -version` and throw error if missing. Document Railway deployment steps. Use docker image with pre-built ffmpeg.

**better-sqlite3 (11.7.0):**
- Risk: Native C++ module requires compilation at install. On different architectures (M1/M2 vs Intel) can fail to build or produce incompatible binaries.
- Impact: npm install fails on ARM64 Mac if not prebuilt. Server crashes with "module not found" if binary missing.
- Migration plan: Use sql.js (SQLite compiled to WASM) for portability, or ensure prebuilt binaries. Use docker for consistent builds.

**jsonwebtoken (9.0.2):**
- Risk: JWT library has had security vulnerabilities (e.g., algorithm confusion). Version 9.0.2 is recent but not latest; no automatic dependency updates.
- Impact: If vulnerability discovered, would need manual package-lock update and redeployment.
- Migration plan: Enable Dependabot for automatic security updates. Pin minor version only (^9.0.2) to catch patches.

**express-rate-limit (7.5.0):**
- Risk: Rate limiters store state in memory by default. If Railway scales to multiple dynos, rate limits per-dyno independently (not global).
- Impact: User can bypass rate limits by request distribution across dyno instances.
- Migration plan: Configure store option to use Redis. For single-instance, acceptable. Document limitation.

---

## Missing Critical Features

**No Avatar Video Caching:**
- Problem: Every lesson load fetches avatar videos from server. No browser cache headers set, so videos re-downloaded on every play.
- Blocks: Offline support, fast lesson replay.
- Improve: Add Cache-Control: max-age=604800 to video endpoints. Use IndexedDB to store generated videos client-side.

**No Lesson Search:**
- Problem: Lessons shown as flat list. No way to find specific vocabulary by keyword (e.g., search "food" finds Food lesson).
- Blocks: UX for large lesson libraries (100+ lessons), discoverability.
- Improve: Add full-text search endpoint. Index lesson titles, subtitles, phrase English translations.

**No User Profile Data Backup/Export:**
- Problem: User progress, XP, quiz submissions only stored in database. No way to export or backup personal data.
- Blocks: GDPR compliance (data portability), user migration to new app.
- Improve: Add /api/v1/auth/export endpoint that returns user.json with all personal data. Schedule nightly backups to S3.

**No Admin Dashboard:**
- Problem: No way to monitor avatar generation jobs, delete user data, or view error logs without SSH access.
- Blocks: Production incident response, user support.
- Improve: Create admin panel at /admin with auth check. Show active jobs, error logs, user list.

---

## Test Coverage Gaps

**Avatar Pipeline Functions Untested:**
- What's not tested: startGeneration, processNextBatch, pollKlingTasks, checkJobCompletion functions
- Files: `server/services/avatarPipeline.js`
- Risk: Changes to job state machine, concurrency logic, or error handling could silently break production generation flow. Recent "stuck at 0%" bug suggests insufficient test coverage.
- Priority: **High** — This is core user-facing feature with no automated tests.

**Kling API Client Untested:**
- What's not tested: submitLipSync, pollTaskStatus, downloadVideo functions
- Files: `server/services/klingApi.js`
- Risk: API response parsing changes or network errors will only be caught at runtime. No mocking/stubbing tests.
- Priority: **High** — Fragile area that needs schema validation tests and mock Kling responses.

**Auth Middleware Untested:**
- What's not tested: JWT validation, token expiry, invalid tokens
- Files: `server/middleware/auth.js`
- Risk: Malformed tokens cause 500 errors instead of proper 401 responses.
- Priority: **High** — Security-critical path.

**Database Query Tests Missing:**
- What's not tested: Migration correctness, index usage, query performance
- Files: `server/migrate.js`, all route query strings
- Risk: Schema changes could break queries; indexes might not be used; N+1 queries undetected.
- Priority: **Medium** — Would catch regression on schema changes.

**Frontend Component Tests Missing:**
- What's not tested: Screen transitions, form validation, API error handling
- Files: `src/App.jsx`, `src/api.js`
- Risk: UI bugs only caught via manual testing. Changes to screen logic could break navigation.
- Priority: **Medium** — Large monolithic component suggests test suite needed for refactoring confidence.

**Rate Limit Tests Missing:**
- What's not tested: Limiter behavior under concurrent requests, bypass attempts
- Files: `server/middleware/rateLimit.js`
- Risk: Rate limit changes could inadvertently weaken security or lock out legitimate users.
- Priority: **Low** — Middleware is simple, but worth testing after changes.

---

*Concerns audit: 2026-03-14*
