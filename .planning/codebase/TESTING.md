# Testing Patterns

**Analysis Date:** 2026-03-14

## Test Framework

**Runner:**
- No test runner detected (Jest, Vitest, Mocha not configured)
- No test files found in codebase (no `.test.js`, `.spec.js`)

**Assertion Library:**
- Not applicable (no testing framework in place)

**Run Commands:**
- No test scripts in `package.json` or `server/package.json`
- Manual testing or QA testing appears to be the current approach

```bash
# Frontend dev server
npm run dev                    # Vite dev server with hot reload
npm run build                  # Build for production
npm run preview               # Preview production build locally

# Server dev
cd server && npm run dev       # Watch mode with --watch flag
cd server && npm run start     # Run server normally
```

## Current Testing Approach

**Manual Testing:**
- Frontend: Browser-based manual testing via Vite dev server (`npm run dev`)
- Backend: Curl/Postman likely used for API endpoint testing
- No automated tests in CI/CD pipeline

**Development Workflow:**
- Frontend development: `npm run dev` (Vite with hot module replacement)
- Server development: `cd server && npm run dev` (Node --watch mode)
- Build verification: `npm run build` to check for compilation errors

## Test File Organization

**Not Applicable:**
- No test infrastructure configured
- Tests are not co-located or in separate directory

## Recommended Testing Structure (Guidance)

If tests are added to this project, follow these conventions:

**Location Pattern:**
- Co-located with source: `src/App.test.jsx` beside `src/App.jsx`
- Server routes: `server/routes/auth.test.js` beside `server/routes/auth.js`
- Services: `server/services/ttsService.test.js` beside `server/services/ttsService.js`

**Naming:**
- `.test.js` or `.test.jsx` suffix (co-located)
- Alternative: `__tests__/` directory at same level as source

**Test Runner Setup (Recommended):**
Based on the project stack (Vite + React + Express):
- **Frontend:** Vitest (Vite-native) or Jest
- **Backend:** Jest or Node's built-in assert module
- **E2E:** Playwright or Cypress

## Manual Testing Patterns Observed

**Frontend Security Testing:**
The codebase includes defensive security patterns that would need testing:

From `src/App.jsx` - Security utilities that need coverage:
```javascript
/**
 * Input sanitization — strips dangerous characters, enforces length limits,
 * and normalizes Unicode to prevent homoglyph/RTL override attacks.
 */
const sanitizeInput = (str, maxLength = 30) => {
  if (typeof str !== "string") return "";
  return str
    .normalize("NFC")                            // Normalize Unicode
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "")  // Strip zero-width
    .replace(/[<>"'`\\{}()|;]/g, "")             // Strip HTML/JS chars
    .trim()
    .slice(0, maxLength);
};
```

**Test scenarios (if tests were to be written):**
- Sanitization removes HTML injection characters
- Sanitization preserves valid African diacritics
- Sanitization enforces max length
- Rate limiter prevents rapid-fire calls

**Backend Validation Testing:**
From `server/middleware/validate.js`:
```javascript
/**
 * Middleware factory: validate request body fields.
 * Returns 400 with specific errors if validation fails.
 */
export function validateBody(rules) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, validator, message] of rules) {
      const value = req.body[field];
      if (!validator(value)) {
        errors.push({ field, message });
      }
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: "Validation failed", details: errors });
    }
    next();
  };
}
```

**Test scenarios (if tests were to be written):**
- Email validation accepts valid emails
- Email validation rejects invalid formats
- Password validation enforces minimum length (6 chars)
- Password validation enforces maximum length (128 chars)
- Name validation accepts Unicode (African diacritics)
- Name validation rejects special characters

## Error Handling Patterns (Testing Considerations)

**Frontend Error Handling:**
Error states are tracked in React state and displayed:

From `src/App.jsx`:
```javascript
const [authError, setAuthError] = useState("");
// ...
try {
  const data = await api.login(email, password);
  setToken(data.token);
} catch (err) {
  setAuthError(err.message || "Authentication failed");
}
```

**Test scenarios would need to cover:**
- Invalid login credentials display error message
- Network errors are caught and displayed
- Form validation errors show specific field messages
- Generation progress polling handles API failures gracefully

**Backend Error Handling:**
All Express routes follow consistent error pattern:

From `server/routes/auth.js`:
```javascript
try {
  // operation
} catch (err) {
  console.error("Register error:", err);
  res.status(500).json({ error: "Registration failed" });
}
```

**Test scenarios would need to cover:**
- Valid credentials return 201 with token
- Duplicate email returns 409 conflict
- Invalid password returns 400 bad request
- Database errors return 500
- Missing auth header returns 401

## Rate Limiting Patterns (Testing Considerations)

From `server/middleware/rateLimit.js`:
```javascript
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,  // 10 attempts per 15 min
  message: { error: "Too many authentication attempts..." },
});

export const videoUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 3,
});
```

**Test scenarios would need to cover:**
- Authentication endpoints allow 10 requests per 15 min
- 11th request is rate-limited with 429 status
- Video uploads allow 3 per hour
- Generation trigger allows 2 per hour

## Async Testing Patterns

**Frontend Async Patterns:**
Promise-based with .catch() chains:

```javascript
videoRef.current.play().catch(() => setVideoError(true));
audioRef.current.play().catch(() => {});  // Silent fail for optional audio
```

Async/await with try-catch:
```javascript
try {
  const data = await api.startGeneration(sourceVideoId);
  setGenerationJobId(data.jobId);
} catch (err) {
  setVideoError(true);
}
```

**If testing async, patterns to follow:**
- Test promise resolution and rejection paths
- Mock API responses with success and error cases
- Test component state updates after async operations
- Verify cleanup of abort controllers or timers

**Backend Async Patterns:**
All database operations and external API calls wrapped in try-catch:

From `server/services/avatarPipeline.js`:
```javascript
export async function startGeneration(userId, sourceVideoId) {
  // Verify source video
  const source = db.prepare("SELECT * FROM avatar_source_videos...").get(...);
  if (!source) {
    throw new Error("Source video not found");
  }
  // Create job record
  const jobResult = db.prepare("INSERT INTO generation_jobs...").run(...);
  // Queue processing
  setTimeout(() => processNextBatch(jobId), 500);
  return { jobId: Number(jobId), totalPhrases: phrases.length };
}
```

**If testing async, patterns to follow:**
- Mock database calls
- Mock external API calls (Kling, Google Translate TTS)
- Test error paths when sources don't exist
- Verify database transactions complete atomically

## Mocking Considerations

**Frontend Mocks Needed:**
- `window.fetch()` for API calls
- `localStorage` for auth token persistence
- Media APIs: `HTMLMediaElement.prototype.play()`
- Browser APIs: `XMLHttpRequest` for video upload progress

**Example mock setup (hypothetical):**
```javascript
// Mock fetch for API calls
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ token: "test-token" })
  })
);

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
global.localStorage = localStorageMock;
```

**Backend Mocks Needed:**
- `better-sqlite3` database connection
- External APIs: Kling AI, Google Translate TTS
- File system operations (fs module)
- FFmpeg/FFprobe for video processing

**Example mock setup (hypothetical):**
```javascript
jest.mock('../db.js');
jest.mock('../services/klingApi.js');

const mockDb = require('../db.js');
mockDb.prepare = jest.fn(() => ({
  get: jest.fn(() => ({ id: 1, user_id: 1 })),
  run: jest.fn(() => ({ lastInsertRowid: 1 })),
  all: jest.fn(() => []),
}));
```

## What to Mock

**Frontend:**
- All fetch calls (API endpoints)
- localStorage (token persistence)
- Browser media playback (optional audio/video)
- timers (setInterval for polling)

**Backend:**
- Database operations (queries return predictable data)
- External API calls (Kling, Google TTS, webhooks)
- File system operations (avoid writing actual files during tests)
- FFmpeg execution (mock video processing results)

## What NOT to Mock

**Frontend:**
- React hooks (useState, useEffect) — use real React
- React component rendering — use rendering library
- CSS-in-JS styles (render but don't validate exact values)

**Backend:**
- Express middleware chains — test middleware behavior
- Input validation functions — validate actual rules
- Rate limiter behavior — verify limits are enforced
- JWT token generation/verification — use real jwt library

## Coverage Gaps

**Critical untested areas:**

1. **Video Avatar Generation Pipeline** (`server/services/avatarPipeline.js`):
   - Complex async state management with polling
   - Handles Kling API responses and task tracking
   - Edge cases: job cancellation, retry logic, concurrency limits
   - Risk: Generation failures could accumulate in database

2. **TTS Service Failover** (`server/services/ttsService.js`):
   - Provider failover logic (Abena → Google → Silent)
   - Chunk handling for long text
   - Network error handling
   - Risk: TTS failures silently fall back to silent audio

3. **Quiz Submission Transaction** (`server/routes/quiz.js`):
   - Uses database transactions for atomic inserts
   - Concurrent submissions from same user
   - Risk: Data corruption if transaction fails mid-operation

4. **Authentication Flow**:
   - JWT signing and verification
   - Token expiration and refresh
   - Cross-origin CSRF protection
   - Risk: Auth bypasses or token leaks

5. **Rate Limiter Enforcement**:
   - Configured but not tested for actual limits
   - Different limits per endpoint
   - Risk: Abuse vectors not caught

6. **Upload Processing**:
   - File validation and size limits
   - Directory creation and permissions
   - Concurrent upload handling
   - Risk: Disk space exhaustion, path traversal

7. **Frontend Form Validation**:
   - Character input validation
   - Unicode normalization
   - RTL override attack prevention
   - Risk: Injection attacks or invalid data reaching server

## Testing Infrastructure Recommendations

**To establish testing in this project:**

1. **Install test framework** (for backend):
   ```bash
   cd server
   npm install --save-dev jest
   ```

2. **Create jest config** (`server/jest.config.js`):
   ```javascript
   export default {
     testEnvironment: 'node',
     collectCoverage: true,
     coveragePathIgnorePatterns: ['/node_modules/'],
     testMatch: ['**/*.test.js'],
   };
   ```

3. **Add test scripts** to `server/package.json`:
   ```json
   "test": "jest",
   "test:watch": "jest --watch",
   "test:coverage": "jest --coverage"
   ```

4. **For frontend** (if Vitest is chosen):
   ```bash
   npm install --save-dev vitest @vitest/ui @testing-library/react
   ```

5. **Create test files** following pattern:
   - `server/routes/__tests__/auth.test.js`
   - `server/services/__tests__/ttsService.test.js`

---

*Testing analysis: 2026-03-14*
