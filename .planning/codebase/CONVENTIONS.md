# Coding Conventions

**Analysis Date:** 2026-03-14

## Naming Patterns

**Files:**
- Frontend: PascalCase for components (`App.jsx`, `VideoAvatar`), camelCase for utility files (`api.js`, `main.jsx`)
- Backend: camelCase for all files (`index.js`, `avatarPipeline.js`, `ttsService.js`)
- Database: snake_case in SQL schemas and JSON keys (`user_id`, `created_at`, `lesson_slug`, `quiz_submissions`)

**Functions:**
- camelCase for all functions: `sanitizeInput()`, `isValidName()`, `startGeneration()`, `getGenerationStatus()`
- Middleware functions follow pattern: `requireAuth()`, `optionalAuth()`, `validateBody()`
- Helper/utility functions are descriptive: `generateGoogleTTS()`, `chunkText()`, `ensureDirs()`

**Variables:**
- camelCase for all variables: `lastCall`, `authToken`, `uploadBase`, `errorMessage`
- State variables use React convention: `const [isPlaying, setIsPlaying] = useState(false)`
- Object constants use all-caps: `JWT_SECRET`, `API_BASE`, `KLING_BASE`, `UPLOAD_BASE`
- Short constants use single letters in design systems: `C` (colors), `T` (typography), `R` (responsive), `FX` (effects)

**Types/Objects:**
- No explicit TypeScript types (JavaScript project), but parameter documentation is provided via JSDoc
- Database record objects use snake_case keys: `{ user_id, email, password_hash, created_at }`
- API response objects use camelCase: `{ token, user, data }`

## Code Style

**Formatting:**
- No automatic formatter configured (no ESLint/Prettier)
- Indentation: 2 spaces throughout (Express, React, JavaScript)
- Line length: no strict limit observed (some lines exceed 100 chars)
- Semicolons: used consistently at end of statements

**Linting:**
- No ESLint or Prettier configuration found
- No TypeScript compiler (project uses JavaScript)
- No automated style enforcement

## Import Organization

**Order:**
1. Node.js core modules: `import path from "path"`
2. Third-party packages: `import express from "express"`, `import jwt from "jsonwebtoken"`
3. Environment config: `import dotenv from "dotenv"` (then `dotenv.config()`)
4. Local modules: `import db from "../db.js"`, `import * as api from "./api.js"`
5. React hooks (when needed): `import { useState, useEffect } from "react"`

**Path Aliases:**
- No path aliases configured (`jsconfig.json` or `tsconfig.json` not in use)
- Relative imports used throughout: `"./api.js"`, `"../db.js"`, `"../../middleware/auth.js"`
- Root import of database: `import db from "../db.js"` (used consistently across all routes/services)

**Example patterns:**

From `src/App.jsx`:
```javascript
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as api from "./api.js";
```

From `server/index.js`:
```javascript
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { globalLimiter } from "./middleware/rateLimit.js";
import { startPollingLoop } from "./services/avatarPipeline.js";
import authRoutes from "./routes/auth.js";
```

## Error Handling

**Patterns:**

Server-side (Express routes):
- Try-catch blocks wrap async operations
- Validation errors return 400 status with specific error messages
- Authentication failures return 401 status
- Resource not found returns 404 status
- Internal errors return 500 status
- All errors log to console: `console.error("Register error:", err)`
- Error responses follow pattern: `{ error: "message" }` or `{ error: "message", details: [...] }`

Example from `server/routes/auth.js`:
```javascript
router.post("/register", authLimiter, validateBody([...]), async (req, res) => {
  try {
    // logic
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});
```

Frontend (React):
- Async operations wrapped in try-catch
- Errors stored in component state: `const [authError, setAuthError] = useState("")`
- Caught errors displayed to user via UI: `{authError && <p>{authError}</p>}`
- Promise `.catch()` chains for non-fatal errors
- Some errors silently fail: `.catch(() => {})` (e.g., optional analytics)

Example from `src/App.jsx`:
```javascript
try {
  const data = await api.login(email, password);
  setToken(data.token);
} catch (err) {
  setAuthError(err.message || "Authentication failed");
}
```

**Security-focused error handling:**
- Input sanitization happens before validation: `sanitizeInput()`, `sanitize()`
- Validation middleware normalizes Unicode and strips special chars
- Rate limiters on sensitive endpoints (auth, uploads, generation)
- Errors do NOT leak sensitive information (generic messages to client)

## Logging

**Framework:** console (Node.js native)

**Patterns:**
- Server startup logs: `console.log("\n🌍 Ɔkasa server running on port ${PORT}")`
- Operation logs use emoji prefixes: `🎬`, `🔊`, `🔇`, `⚠️`
- Informational logs: `console.log("...")`
- Error logs: `console.error("...", err)`
- Warnings: `console.warn("[Security] Blocked non-whitelisted speech: ...")`
- Generated content logged with emoji and details: `console.log("  🔊 TTS generated (google/tw): ... → ${outputPath}")`

Example from `server/services/ttsService.js`:
```javascript
console.log(`  🔊 TTS generated (google/${langCode}): ${text.slice(0, 40)}... → ${outputPath}`);
```

Frontend:
- Limited console logging (mostly security warnings)
- Example: `console.warn("[Security] Blocked non-whitelisted speech:", text)`
- Error logging: `console.error("Generation poll error:", err)`

## Comments

**When to Comment:**
- Block comments explain security measures: `/* ── SECURITY UTILITIES ── */`
- Function-level documentation: JSDoc blocks with @param, @returns
- Inline comments for non-obvious logic or business rules
- Section dividers use pattern: `// ── SECTION NAME ──`

**JSDoc/TSDoc:**
- Functions documented with `@param` and `@returns`
- Security functions and API endpoints get full documentation
- Example from `server/services/avatarPipeline.js`:

```javascript
/**
 * Begin avatar generation for a user.
 * Creates the job record and queues all phrases for processing.
 * @param {number} userId
 * @param {number} sourceVideoId
 * @returns {{ jobId: number, totalPhrases: number }}
 */
export function startGeneration(userId, sourceVideoId) {
```

- Middleware documented with purpose: `Middleware: Require authentication.`
- Complex logic documented with purpose statement

## Function Design

**Size:**
- Most functions 10-50 lines
- Async middleware/routes typically 15-40 lines with try-catch wrapper
- Utility functions stay under 30 lines
- Large components (like `OkasaApp`) exceed 2000 lines (single-file monolithic structure)

**Parameters:**
- Destructuring used for object parameters: `updateProfile({ childName, parentName, language })`
- Optional parameters have defaults: `sanitizeInput(str, maxLength = 30)`
- Middleware follows Express convention: `(req, res, next)` or `(err, req, res, next)`

**Return Values:**
- API routes return promises that resolve with JSON responses
- Utility functions return primitives or objects
- Database operations return query results or row counts
- No implicit returns (explicit `return` or `res.json()`)

## Module Design

**Exports:**
- Frontend: default export for main component: `export default function OkasaApp()`
- Backend: named exports for functions: `export function startGeneration()`, `export async function login()`
- No barrel files (`index.js` re-exports) observed
- Each file has single responsibility: routes, middleware, services are separated

**Barrel Files:**
- Not used (no `index.js` re-exporting multiple modules)
- Direct imports: `import { startPollingLoop } from "./services/avatarPipeline.js"`

**Module Organization:**
- Routes in `server/routes/` organized by feature: `auth.js`, `profiles.js`, `lessons.js`, `quiz.js`, `progress.js`, `avatars.js`
- Middleware in `server/middleware/`: `auth.js` (JWT logic), `validate.js` (input validation), `rateLimit.js` (rate limiters)
- Services in `server/services/`: business logic for external APIs and pipelines
- Frontend: single `App.jsx` with all components and state management

---

*Convention analysis: 2026-03-14*
