# Technology Stack

**Analysis Date:** 2026-03-14

## Languages

**Primary:**
- JavaScript (ES2020+) - Frontend client and backend server
- React 19.1.0 - UI component framework
- Node.js 20.19.0+ - Server runtime

**Secondary:**
- SQL (SQLite) - Data storage

## Runtime

**Environment:**
- Node.js 20.19.0+ (specified in `.node-version`)

**Package Manager:**
- npm 10.x+ (uses package-lock.json)
- Lockfile: Present (`package-lock.json` and `server/package-lock.json`)

## Frameworks

**Core:**
- Express 4.21.0 - HTTP server and REST API (`server/index.js`)
- React 19.1.0 - UI framework (`src/App.jsx`)
- Vite 7.0.0 - Build tool and dev server (`vite.config.js`)

**Testing:**
- Not detected

**Build/Dev:**
- @vitejs/plugin-react 4.6.0 - React support in Vite
- Vite 7.0.0 - Frontend build and dev server

## Key Dependencies

**Critical:**
- better-sqlite3 11.7.0 - Synchronous SQLite database driver (`server/db.js`)
- express 4.21.0 - Web framework for API routes (`server/routes/`)
- jsonwebtoken 9.0.2 - JWT token signing and verification (`server/middleware/auth.js`)
- bcryptjs 2.4.3 - Password hashing (`server/routes/auth.js`)
- multer 1.4.5-lts.1 - File upload handling (`server/routes/avatars.js`)

**Media Processing:**
- @ffmpeg-installer/ffmpeg 1.1.0 - FFmpeg binary installation
- @ffprobe-installer/ffprobe 2.1.2 - FFprobe binary installation
- fluent-ffmpeg 2.1.3 - FFmpeg Node.js wrapper (`server/services/frameExtractor.js`)

**Security & Middleware:**
- helmet 8.0.0 - HTTP security headers (`server/index.js`)
- cors 2.8.5 - CORS middleware (`server/index.js`)
- express-rate-limit 7.5.0 - Rate limiting (`server/middleware/rateLimit.js`)
- dotenv 16.4.7 - Environment variable loading (`server/db.js`, `server/index.js`)

**Utilities:**
- morgan 1.10.0 - HTTP request logging (`server/index.js`)
- @types/react 19.1.8 - TypeScript types for React
- @types/react-dom 19.1.6 - TypeScript types for React DOM

## Configuration

**Environment:**
- Managed via `.env` files
- `.env.example` provided with all required variables
- Configuration loaded via `dotenv.config()` in `server/db.js` and `server/index.js`

**Key Configurations:**
- `PORT` - Server port (default: 3001)
- `JWT_SECRET` - JWT signing secret (must be set in production)
- `DB_PATH` - SQLite database file path (default: `./okasa.db`)
- `UPLOAD_DIR` - Directory for user file uploads (default: `./uploads`)
- `NODE_ENV` - Execution environment (development/production)
- `KLING_API_KEY` - Kling AI lip-sync API key
- `KLING_API_SECRET` - Kling AI lip-sync API secret
- `KLING_API_BASE_URL` - Kling API endpoint (default: `https://api.klingai.com`)
- `ABENA_API_KEY` - Abena TTS provider API key (placeholder for future)
- `TTS_PROVIDER` - TTS service selection (google | abena, default: google)
- `MAX_VIDEO_UPLOAD_MB` - Maximum video upload size (default: 50MB)
- `AVATAR_GENERATION_CONCURRENCY` - Parallel Kling API calls (default: 2)

**Build:**
- `vite.config.js` - Vite configuration with React plugin and API proxy
- Proxy configuration: `/api/*` routes to `http://localhost:3001` (dev only)

**Database:**
- SQLite 3 with WAL mode enabled for concurrent reads
- Foreign key constraints enabled
- Database file: `server/okasa.db`

## Platform Requirements

**Development:**
- Node.js 20.19.0 or higher
- npm with access to package registry
- Optional: FFmpeg/FFprobe binaries (auto-installed via npm dependencies)

**Production:**
- Node.js 20.19.0 or higher
- File system access for SQLite database persistence
- File system access for upload directory (`./uploads`)
- Environment variables configured for all required APIs (Kling, etc.)
- Deployment target: Any Node.js-capable platform (Railway, AWS, Docker, etc.)

## Build Process

```bash
npm run build              # Vite builds frontend, then npm install --production in server
npm start                  # Run migrations, seed DB, start server
npm run dev               # Frontend: Vite dev server; Backend: node --watch index.js
```

**Build output:**
- Frontend: `dist/` directory
- Server: ES modules (type: "module" in both package.json files)

## Scripts

**Client (root `package.json`):**
- `dev` - Start Vite dev server (port 5173 by default)
- `build` - Vite build + production install of server dependencies
- `start` - Run migrations, seed, and start Express server

**Server (`server/package.json`):**
- `start` - Start Express server (port 3001)
- `dev` - Start with file watching (auto-restart on changes)
- `migrate` - Run database schema migrations
- `seed` - Populate database with initial data
- `setup` - Run both migrate and seed

---

*Stack analysis: 2026-03-14*
