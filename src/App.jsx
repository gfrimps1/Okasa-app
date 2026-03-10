import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as api from "./api.js";
/* ═══════════════════════════════════════════════════
   ƆKASA — Mother Tongue Tutor (Parent Avatar Edition)
   Space-Explorer-inspired immersive UI
   ═══════════════════════════════════════════════════ */

/* ── SECURITY UTILITIES ── */

/**
 * Input sanitization — strips dangerous characters, enforces length limits,
 * and normalizes Unicode to prevent homoglyph/RTL override attacks.
 */
const sanitizeInput = (str, maxLength = 30) => {
  if (typeof str !== "string") return "";
  return str
    .normalize("NFC")                            // Normalize Unicode to canonical form
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "")  // Strip zero-width & RTL override chars
    .replace(/[<>"'`\\{}()|;]/g, "")             // Strip HTML/JS injection characters
    .trim()
    .slice(0, maxLength);                         // Enforce max length
};

/**
 * Validate a name field — letters, spaces, hyphens, apostrophes only.
 * Allows Akan/African names with diacritics (Ɛ, ɛ, Ɔ, ɔ, etc.)
 */
const isValidName = (str) => {
  if (!str || str.length < 1 || str.length > 30) return false;
  // Allow Unicode letters, spaces, hyphens, apostrophes
  return /^[\p{L}\p{M}\s'-]+$/u.test(str);
};

/**
 * Rate limiter — prevents rapid-fire calls (speech synthesis abuse,
 * quiz button spamming, etc.)
 */
const createRateLimiter = (cooldownMs = 1000) => {
  let lastCall = 0;
  return (fn) => {
    const now = Date.now();
    if (now - lastCall < cooldownMs) return false;
    lastCall = now;
    fn();
    return true;
  };
};

/**
 * Secure text renderer — escapes any residual HTML entities as a
 * defense-in-depth layer on top of React's built-in escaping.
 */
const safeText = (str) => {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
};

/**
 * Freeze lesson data — prevents runtime mutation of the immutable
 * lesson content (prototype pollution defense).
 */
const deepFreeze = (obj) => {
  Object.freeze(obj);
  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const val = obj[prop];
    if (val && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  });
  return obj;
};
/* ── Theme Refresh UI Design Tokens ── */
const C = {
  // Primitive palette (PRD Theme Refresh)
  ivory: "#FBF8F2", warmCream: "#F5EFE3", charcoal: "#1F2430",
  sunYellow: "#F5C84C", playfulPurple: "#6558F5", lavender: "#8F7CF6",
  softGreen: "#9AD94B", coral: "#F27D72", skyBlue: "#78B8FF",
  // Legacy accent aliases (preserved for components)
  sunflower: "#F5C84C", tangerine: "#FF7E5F", mint: "#6AD0AE",
  grape: "#A78BFA", sky: "#6E85FF", blush: "#F58AB6",
  // Semantic text & surface (static fallbacks)
  navy: "#1F2430", white: "#FFFFFF", cream: "#FBF8F2",
  // Lesson colors (unchanged)
  accentCoral: "#F27D72", accentTeal: "#6AD0AE",
  gold: "#F5C84C", energy: "#FF7E5F", leaf: "#6AD0AE",
};
const T = {
  hero:     { fontFamily: "'Nunito', sans-serif", fontSize: 48, lineHeight: 1.0, letterSpacing: -1.2, fontWeight: 800 },
  headline: { fontFamily: "'Nunito', sans-serif", fontSize: 36, lineHeight: 1.05, letterSpacing: -0.8, fontWeight: 700 },
  subhead:  { fontFamily: "'Nunito', sans-serif", fontSize: 22, lineHeight: 1.2, letterSpacing: 0.2, fontWeight: 700 },
  body:     { fontFamily: "'Inter', sans-serif", fontSize: 16, lineHeight: 1.55, fontWeight: 400 },
  label:    { fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" },
  pill:     { fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: 0.3 },
};
const R = {
  pill: 999, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32,
  // Semantic aliases
  control: 16, card: 20, cardLg: 24, heroCard: 32,
  panel: 28, bottomNav: 24,
  // Legacy aliases
  cardSm: 16, cardMd: 20,
};
const FX = {
  glassBlur: "blur(16px)",
  // All shadow/border values now come from CSS custom properties
  glassBg: "var(--glass-bg)",
  glassBorder: "var(--glass-border)",
  cardShadow: "var(--card-shadow)",
  pillShadow: "var(--pill-shadow)",
  cardBorder: "var(--card-border)",
};

const LESSONS = [
  {
    id: "greetings", title: "Nkyia", subtitle: "Greetings", icon: "👋", color: C.sunYellow,
    difficulty: 1, world: "Village Square", bgGrad: `linear-gradient(135deg, #1A1D26 0%, ${C.ivory} 100%)`,
    phrases: [
      { twi: "Maakye", phonetic: "maa-chi", english: "Good morning", emoji: "🌅", context: "When the sun wakes up!" },
      { twi: "Maaha", phonetic: "maa-ha", english: "Good afternoon", emoji: "☀️", context: "When the sun is high!" },
      { twi: "Maadwo", phonetic: "maa-jo", english: "Good evening", emoji: "🌙", context: "When stars come out!" },
      { twi: "Medaase", phonetic: "meh-daa-seh", english: "Thank you", emoji: "🙏", context: "Being grateful!" },
    ],
  },
  {
    id: "family", title: "Abusua", subtitle: "Family", icon: "🏠", color: C.coral,
    difficulty: 1, world: "Home Sweet Home", bgGrad: `linear-gradient(135deg, #1C1520 0%, ${C.ivory} 100%)`,
    phrases: [
      { twi: "Maame", phonetic: "maa-meh", english: "Mother", emoji: "👩🏿", context: "The queen of the house!" },
      { twi: "Papa", phonetic: "pah-pah", english: "Father", emoji: "👨🏿", context: "The king of the house!" },
      { twi: "Nana", phonetic: "nah-nah", english: "Grandparent", emoji: "👴🏿", context: "The wisest of all!" },
    ],
  },
  {
    id: "numbers", title: "Nkonta", subtitle: "Numbers", icon: "✨", color: C.sky,
    difficulty: 2, world: "Counting Garden", bgGrad: `linear-gradient(135deg, #151A2A 0%, ${C.ivory} 100%)`,
    phrases: [
      { twi: "Baako", phonetic: "baa-ko", english: "One", emoji: "☝️", context: "Just one finger!" },
      { twi: "Mmienu", phonetic: "mien-u", english: "Two", emoji: "✌️", context: "A pair, like your eyes!" },
      { twi: "Mmiɛnsa", phonetic: "mien-sa", english: "Three", emoji: "🤟", context: "Three little birds!" },
    ],
  },
  {
    id: "animals", title: "Mmoa", subtitle: "Animals", icon: "🦁", color: C.mint,
    difficulty: 2, world: "Safari Trail", bgGrad: `linear-gradient(135deg, #111E1C 0%, ${C.ivory} 100%)`,
    phrases: [
      { twi: "Akoko", phonetic: "ah-ko-ko", english: "Chicken", emoji: "🐔", context: "Cock-a-doodle-doo!" },
      { twi: "Gyata", phonetic: "ja-ta", english: "Lion", emoji: "🦁", context: "The brave king!" },
      { twi: "Ɛsono", phonetic: "eh-so-no", english: "Elephant", emoji: "🐘", context: "Big and gentle!" },
    ],
  },
  {
    id: "food", title: "Aduane", subtitle: "Food", icon: "🍲", color: C.tangerine,
    difficulty: 3, world: "Kitchen Kingdom", bgGrad: `linear-gradient(135deg, #1E1812 0%, ${C.ivory} 100%)`,
    phrases: [
      { twi: "Nsuo", phonetic: "en-suo", english: "Water", emoji: "💧", context: "Splish splash!" },
      { twi: "Ɛkɔm de me", phonetic: "eh-kom-deh-meh", english: "I am hungry", emoji: "😋", context: "Tummy rumbles!" },
      { twi: "Nkwan", phonetic: "en-kwan", english: "Soup", emoji: "🍲", context: "Yummy in my tummy!" },
    ],
  },
];

// Freeze lesson data to prevent prototype pollution / runtime tampering
deepFreeze(LESSONS);

/* ─── PARENT AI AVATAR ─── */
const ParentAvatar = ({ name = "Parent", size = 160, speaking = false, mood = "neutral", ring = true, showLabel = true, uploaded = false }) => {
  const [mouthPhase, setMouthPhase] = useState(0);
  useEffect(() => {
    if (!speaking) { setMouthPhase(0); return; }
    const iv = setInterval(() => setMouthPhase(p => (p + 1) % 4), 150);
    return () => clearInterval(iv);
  }, [speaking]);
  const mouthHeights = [2, 7, 4, 9];
  const mouthH = mouthHeights[mouthPhase];
  const glowColor = speaking ? "rgba(102,224,163,0.6)" : mood === "celebrate" ? "rgba(255,210,51,0.5)" : "rgba(79,195,247,0.3)";
  const ringColor = speaking ? C.mint : mood === "celebrate" ? C.sunYellow : mood === "encourage" ? C.coral : C.sky;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        {ring && <div style={{
          position: "absolute", inset: -10, borderRadius: "50%",
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
          animation: speaking ? "avatarPulse 1.2s ease-in-out infinite" : "none",
          transition: "background 0.4s ease",
        }} />}
        {ring && <div style={{
          position: "absolute", inset: -5, borderRadius: "50%",
          border: `3px solid ${ringColor}`,
          animation: speaking ? "ringPulse 1.2s ease-in-out infinite" : "none",
          transition: "border-color 0.4s ease",
        }} />}
        <div style={{
          width: size, height: size, borderRadius: "50%", overflow: "hidden",
          background: uploaded
            ? "linear-gradient(140deg, #3a2518 0%, #5c3a24 40%, #3a2518 100%)"
            : "linear-gradient(140deg, #2a2040 0%, #1a1530 100%)",
          position: "relative", boxShadow: `0 8px 32px rgba(0,0,0,0.3)`,
        }}>
          {uploaded ? (
            <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" }}>
              <div style={{ position: "absolute", top: size * 0.08, width: size * 0.65, height: size * 0.32, borderRadius: "50% 50% 40% 40%", background: "linear-gradient(135deg, #1a0f08, #2d1a0e)", zIndex: 1 }} />
              <div style={{
                width: size * 0.52, height: size * 0.58, borderRadius: "48% 48% 44% 44%",
                background: "linear-gradient(180deg, #8B6914 0%, #7A5C12 50%, #6B4F10 100%)",
                position: "relative", marginTop: size * 0.1, zIndex: 2,
                boxShadow: "inset 0 -4px 12px rgba(0,0,0,0.15)",
              }}>
                <div style={{ position: "absolute", top: "34%", left: "18%", width: "22%", height: "14%", background: "white", borderRadius: "50%", overflow: "hidden" }}>
                  <div style={{ position: "absolute", width: "65%", height: "65%", background: "#2C1810", borderRadius: "50%", top: "20%", left: mood === "celebrate" ? "25%" : "20%", transition: "left 0.3s" }}>
                    <div style={{ position: "absolute", width: "35%", height: "35%", background: "white", borderRadius: "50%", top: "15%", left: "55%" }} />
                  </div>
                </div>
                <div style={{ position: "absolute", top: "34%", right: "18%", width: "22%", height: "14%", background: "white", borderRadius: "50%", overflow: "hidden" }}>
                  <div style={{ position: "absolute", width: "65%", height: "65%", background: "#2C1810", borderRadius: "50%", top: "20%", left: mood === "celebrate" ? "25%" : "20%", transition: "left 0.3s" }}>
                    <div style={{ position: "absolute", width: "35%", height: "35%", background: "white", borderRadius: "50%", top: "15%", left: "55%" }} />
                  </div>
                </div>
                <div style={{ position: "absolute", top: "26%", left: "16%", width: "24%", height: 3, background: "#1a0f08", borderRadius: 2, transform: mood === "celebrate" ? "rotate(-8deg)" : "rotate(-4deg)" }} />
                <div style={{ position: "absolute", top: "26%", right: "16%", width: "24%", height: 3, background: "#1a0f08", borderRadius: 2, transform: mood === "celebrate" ? "rotate(8deg)" : "rotate(4deg)" }} />
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translateX(-50%)", width: "14%", height: "12%", background: "rgba(0,0,0,0.08)", borderRadius: "40% 40% 50% 50%" }} />
                <div style={{
                  position: "absolute", bottom: "18%", left: "50%", transform: "translateX(-50%)",
                  width: mood === "celebrate" ? "40%" : "30%", height: mouthH,
                  background: speaking ? "#8B2020" : mood === "celebrate" ? "#8B2020" : "#6B3030",
                  borderRadius: speaking ? "4px 4px 50% 50%" : mood === "celebrate" ? "4px 4px 50% 50%" : "50%",
                  transition: "width 0.2s, height 0.1s, border-radius 0.2s", overflow: "hidden",
                }}>
                  {(speaking || mood === "celebrate") && mouthH > 5 && (
                    <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: "40%", background: "#CC4040", borderRadius: "0 0 50% 50%" }} />
                  )}
                </div>
                {(mood === "celebrate" || mood === "encourage") && (
                  <>
                    <div style={{ position: "absolute", top: "52%", left: "8%", width: "16%", height: "10%", background: "rgba(255,150,100,0.25)", borderRadius: "50%" }} />
                    <div style={{ position: "absolute", top: "52%", right: "8%", width: "16%", height: "10%", background: "rgba(255,150,100,0.25)", borderRadius: "50%" }} />
                  </>
                )}
              </div>
              <div style={{ position: "absolute", bottom: 0, width: "90%", height: "28%", background: "linear-gradient(180deg, #C41E3A 0%, #A01830 100%)", borderRadius: "40% 40% 0 0", boxShadow: "inset 0 4px 8px rgba(255,255,255,0.1)" }} />
              <div style={{ position: "absolute", bottom: "6%", width: "50%", height: "6%", background: "rgba(255,210,50,0.5)", borderRadius: 4 }} />
            </div>
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: size * 0.3, opacity: 0.4 }}>📹</span>
              <span style={{ fontSize: 11, color: "#777", fontWeight: 700 }}>Upload video</span>
            </div>
          )}
        </div>
        {speaking && uploaded && (
          <div style={{
            position: "absolute", bottom: 4, right: 4, display: "flex", alignItems: "center", gap: 4,
            background: C.mint, padding: "4px 10px", borderRadius: 12,
            boxShadow: `0 2px 8px ${C.mint}60`, animation: "avatarPulse 1.5s ease-in-out infinite",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.white }} />
            <span style={{ fontSize: 10, fontWeight: 900, color: C.white }}>LIVE</span>
          </div>
        )}
        {uploaded && (
          <div style={{
            position: "absolute", top: 2, right: 2,
            background: "rgba(255,255,255,0.95)", backdropFilter: FX.glassBlur,
            padding: "3px 8px", borderRadius: R.pill, ...T.label, fontSize: 9, color: C.charcoal,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}>✨ AI</div>
        )}
      </div>
      {showLabel && uploaded && (
        <p style={{ ...T.label, fontSize: 11, color: "var(--text-primary)", margin: 0, textAlign: "center" }}>
          {name}'s AI Tutor
        </p>
      )}
    </div>
  );
};

/* ── Video Avatar (AI lip-sync playback) ── */
const VideoAvatar = ({ phraseId, videoUrl, audioUrl, videoStatus, size = 160, name = "Parent", fallbackSpeaking, fallbackMood, hasAvatar, onVideoEnd }) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);

  // Determine if we have a real video or just TTS audio
  const hasVideo = videoStatus === "ready" && videoUrl;
  const hasTTSOnly = videoStatus === "tts_only" && audioUrl;

  useEffect(() => {
    // Auto-play when mounted
    if (hasVideo && videoRef.current) {
      videoRef.current.play().catch(() => setVideoError(true));
    } else if (hasTTSOnly && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [hasVideo, hasTTSOnly, videoUrl, audioUrl]);

  // If no media or errored, fall back to cartoon avatar
  if ((!hasVideo && !hasTTSOnly) || videoError) {
    return <ParentAvatar size={size} uploaded={hasAvatar} name={name} speaking={fallbackSpeaking} mood={fallbackMood} showLabel={false} ring={true} />;
  }

  const glowColor = isPlaying ? "rgba(102,224,163,0.6)" : "rgba(79,195,247,0.3)";
  const ringColor = isPlaying ? C.mint : C.sky;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        {/* Glow ring */}
        <div style={{
          position: "absolute", inset: -10, borderRadius: "50%",
          background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
          animation: isPlaying ? "avatarPulse 1.2s ease-in-out infinite" : "none",
        }} />
        <div style={{
          position: "absolute", inset: -5, borderRadius: "50%",
          border: `3px solid ${ringColor}`,
          animation: isPlaying ? "ringPulse 1.2s ease-in-out infinite" : "none",
        }} />

        {hasVideo ? (
          /* Video element in circular frame */
          <video
            ref={videoRef}
            src={videoUrl}
            style={{
              width: size, height: size, borderRadius: "50%", objectFit: "cover",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
            playsInline
            onPlay={() => setIsPlaying(true)}
            onEnded={() => { setIsPlaying(false); if (onVideoEnd) onVideoEnd(); }}
            onError={() => setVideoError(true)}
          />
        ) : (
          /* TTS-only: show cartoon avatar face + play audio */
          <>
            <ParentAvatar size={size} uploaded={hasAvatar} name={name} speaking={isPlaying} mood={isPlaying ? "neutral" : "celebrate"} showLabel={false} ring={false} />
            <audio
              ref={audioRef}
              src={audioUrl}
              onPlay={() => setIsPlaying(true)}
              onEnded={() => { setIsPlaying(false); if (onVideoEnd) onVideoEnd(); }}
            />
          </>
        )}

        {/* AI VIDEO badge */}
        <div style={{
          position: "absolute", top: 2, right: 2,
          background: "rgba(255,255,255,0.95)", backdropFilter: FX.glassBlur,
          padding: "3px 8px", borderRadius: R.pill, ...T.label, fontSize: 9, color: C.charcoal,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}>{hasVideo ? "🎬 AI" : "🔊 AI"}</div>

        {isPlaying && (
          <div style={{
            position: "absolute", bottom: 4, right: 4, display: "flex", alignItems: "center", gap: 4,
            background: C.mint, padding: "4px 10px", borderRadius: 12,
            boxShadow: `0 2px 8px ${C.mint}60`, animation: "avatarPulse 1.5s ease-in-out infinite",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.white }} />
            <span style={{ fontSize: 10, fontWeight: 900, color: C.white }}>LIVE</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Speech Bubble ── */
const SpeechBubble = ({ text, color = C.white, textColor = C.charcoal, size = "md", animate = true, dark = false }) => {
  const paddings = { sm: "10px 16px", md: "14px 22px", lg: "18px 28px" };
  const fontSizes = { sm: 14, md: 16, lg: 20 };
  const bg = dark ? "var(--bg-card)" : color;
  const tc = dark ? "var(--text-primary)" : textColor;
  return (
    <div style={{
      position: "relative", background: bg, borderRadius: R.cardSm,
      padding: paddings[size], boxShadow: dark ? "none" : "0 4px 20px rgba(0,0,0,0.06)",
      maxWidth: 340, textAlign: "center", backdropFilter: dark ? FX.glassBlur : "none",
      animation: animate ? "popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" : "none",
      border: dark ? "var(--card-border)" : "none",
    }}>
      <div style={{
        position: "absolute", top: -8, left: "50%", transform: "translateX(-50%)",
        width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent",
        borderBottom: `10px solid ${bg}`,
      }} />
      <p style={{ margin: 0, ...T.body, fontWeight: 600, fontSize: fontSizes[size], color: tc, lineHeight: 1.4 }}>{text}</p>
    </div>
  );
};

/* ── Sankofa Bird ── */
const BirdBuddy = ({ size = 48 }) => (
  <svg viewBox="0 0 80 80" style={{ width: size, height: size, animation: "birdBob 2.5s ease-in-out infinite" }}>
    <ellipse cx="38" cy="42" rx="18" ry="20" fill={C.sunYellow} />
    <ellipse cx="38" cy="47" rx="11" ry="11" fill="#FFF3D6" />
    <circle cx="35" cy="24" r="12" fill={C.sunYellow} />
    <ellipse cx="30" cy="11" rx="2.5" ry="6" fill={C.coral} transform="rotate(-12 30 11)" />
    <ellipse cx="35" cy="9" rx="2.5" ry="7" fill={C.tangerine} />
    <ellipse cx="40" cy="11" rx="2.5" ry="6" fill={C.coral} transform="rotate(12 40 11)" />
    <circle cx="30" cy="22" r="3.5" fill="white" /><circle cx="40" cy="22" r="3.5" fill="white" />
    <circle cx="31" cy="22" r="2" fill={C.charcoal} /><circle cx="41" cy="22" r="2" fill={C.charcoal} />
    <circle cx="31.5" cy="21" r="0.8" fill="white" /><circle cx="41.5" cy="21" r="0.8" fill="white" />
    <path d="M32,27 Q35,30 38,27" fill={C.tangerine} />
    <circle cx="25" cy="25" r="2.5" fill={C.blush} opacity="0.5" />
    <circle cx="45" cy="25" r="2.5" fill={C.blush} opacity="0.5" />
    <path d="M56,48 Q68,42 65,32 Q63,26 58,30" fill={C.coral} />
  </svg>
);

/* ── Floating Orbs (Space-inspired) ── */
const FloatingOrbs = ({ count = 12, colors }) => {
  const orbs = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i, sz: 8 + Math.random() * 40, x: Math.random() * 100,
    y: Math.random() * 100, dur: 10 + Math.random() * 20,
    delay: Math.random() * 10,
    col: colors[i % colors.length], op: 0.08 + Math.random() * 0.15,
    blur: Math.random() > 0.5 ? 8 : 0,
  })), [count, colors]);
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {orbs.map(v => <div key={v.id} style={{
        position: "absolute", width: v.sz, height: v.sz, borderRadius: "50%",
        background: v.col, opacity: v.op, left: `${v.x}%`, top: `${v.y}%`,
        filter: v.blur ? `blur(${v.blur}px)` : "none",
        animation: `orbFloat ${v.dur}s ease-in-out ${v.delay}s infinite alternate`,
      }} />)}
    </div>
  );
};

/* ── Confetti ── */
const Confetti = ({ active }) => {
  const pcs = useMemo(() => active ? Array.from({ length: 40 }, (_, i) => ({
    id: i, col: [C.sunYellow, C.coral, C.sky, C.mint, C.grape, C.tangerine][i % 6],
    x: 40 + (Math.random() - 0.5) * 60, rot: Math.random() * 360,
    del: Math.random() * 0.3, sz: 6 + Math.random() * 8,
    drift: (Math.random() - 0.5) * 200,
  })) : [], [active]);
  if (!active) return null;
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 100, overflow: "hidden" }}>
      {pcs.map(p => <div key={p.id} style={{ position: "absolute", left: `${p.x}%`, top: "25%", width: p.sz, height: p.sz * 0.6, borderRadius: 2, background: p.col, transform: `rotate(${p.rot}deg)`, animation: `confettiFall 1.6s ease-out ${p.del}s forwards`, "--drift": `${p.drift}px` }} />)}
    </div>
  );
};

/* ── Glass Card (frosted glass effect) ── */
const GlassCard = ({ children, style = {}, onClick, dark }) => (
  <div onClick={onClick} style={{
    padding: 20, borderRadius: R.card, position: "relative", overflow: "hidden",
    background: "var(--bg-card)",
    border: "var(--card-border)",
    cursor: onClick ? "pointer" : "default",
    boxShadow: "var(--card-shadow)",
    transition: "all 0.25s ease", ...style,
  }}>
    {children}
  </div>
);

/* ── Big Button ── */
const BigBtn = ({ children, color = C.sunYellow, textColor = C.charcoal, onClick, disabled, style = {} }) => (
  <button onClick={onClick} disabled={disabled} style={{
    border: "none", borderRadius: R.pill, padding: "0 36px", height: 52,
    ...T.pill, fontFamily: "'Inter', sans-serif", cursor: disabled ? "default" : "pointer",
    background: color, color: textColor, width: "100%",
    boxShadow: "var(--pill-shadow)",
    transition: "all 0.15s ease", opacity: disabled ? 0.5 : 1,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 10, ...style,
  }}>{children}</button>
);

/* ── Round Arrow Button (Space Explorer style) ── */
const RoundBtn = ({ onClick, icon = "→", color = C.sunYellow, size = 56 }) => (
  <button onClick={onClick} style={{
    width: size, height: size, borderRadius: R.pill, border: "none",
    background: color,
    color: C.charcoal, fontSize: size * 0.4, fontWeight: 700, cursor: "pointer",
    boxShadow: "var(--pill-shadow)", display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'Inter', sans-serif", transition: "all 0.2s ease",
  }}>{icon}</button>
);

/* ── XP Badge ── */
const XPBadge = ({ xp, dark }) => (
  <div style={{
    display: "inline-flex", alignItems: "center", gap: 6, padding: "0 14px", height: 36, borderRadius: R.pill,
    background: `${C.sunYellow}18`,
    border: `1.5px solid ${C.sunYellow}30`,
    ...T.label, fontSize: 13, color: "var(--accent-gold)",
  }}>⭐ {xp} XP</div>
);

/* ═══════════════════════
   MAIN APP
   ═══════════════════════ */
export default function OkasaApp() {
  const [screen, setScreen] = useState("splash");
  const [setupStep, setSetupStep] = useState(1);
  const [profile, setProfile] = useState({ parentName: "", childName: "", language: "Twi (Ashanti)", videoUploaded: false, avatarReady: false, avatarType: "cartoon" });
  const [isGenerating, setIsGenerating] = useState(false);
  // ── Theme state ──
  const [theme, setTheme] = useState(() => localStorage.getItem('okasa_theme') || 'playfulWarm');
  const isPlayful = theme === 'playfulWarm';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('okasa_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'playfulWarm' ? 'modernStudy' : 'playfulWarm');
  // Avatar video generation state
  const [sourceVideoId, setSourceVideoId] = useState(null);
  const [generationJobId, setGenerationJobId] = useState(null);
  const [generationProgress, setGenerationProgress] = useState({ total: 0, completed: 0, percent: 0, status: "idle" });
  const [avatarVideos, setAvatarVideos] = useState({}); // { phraseId: { status, videoUrl, audioUrl } }
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [phase, setPhase] = useState("watch");
  const [score, setScore] = useState(0);
  const [totalXP, setTotalXP] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [quizOpts, setQuizOpts] = useState([]);
  const [picked, setPicked] = useState(null);
  const [feedback, setFeedback] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [progress, setProgress] = useState({});
  const [parentMood, setParentMood] = useState("neutral");
  const [inputErrors, setInputErrors] = useState({});
  const carouselRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

  // ── Auth & API state ──
  const [authMode, setAuthMode] = useState("login"); // "login" or "register"
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(!!api.getToken());
  const [apiLessons, setApiLessons] = useState(null); // lessons from API (or null = use fallback)

  // ── Auto-login on mount if token exists ──
  useEffect(() => {
    if (!api.getToken()) return;
    api.getMe()
      .then((data) => {
        setIsAuthenticated(true);
        if (data.profile) {
          const hasCompletedSetup = !!(data.profile.parent_name && data.profile.child_name);
          setProfile(p => ({
            ...p,
            parentName: data.profile.parent_name || p.parentName,
            childName: data.profile.child_name || p.childName,
            videoUploaded: hasCompletedSetup || p.videoUploaded,
            avatarReady: hasCompletedSetup || !!data.profile.avatar_url || p.avatarReady,
          }));
        }
        if (data.xp) setTotalXP(data.xp);
      })
      .catch(() => {
        api.clearAuth();
        setIsAuthenticated(false);
      });
  }, []);

  // ── Fetch lessons from API ──
  useEffect(() => {
    if (!isAuthenticated) return;
    api.getLessons()
      .then((data) => {
        if (data.lessons && data.lessons.length > 0) {
          setApiLessons(data.lessons);
        }
      })
      .catch(() => {
        // Silently fall back to hardcoded LESSONS
      });
  }, [isAuthenticated]);

  // ── Fetch progress from API ──
  useEffect(() => {
    if (!isAuthenticated) return;
    api.getProgress()
      .then((data) => {
        if (data.progress) setProgress(data.progress);
        if (data.xp) setTotalXP(data.xp);
      })
      .catch(() => {
        // Silently fall back to local progress
      });
  }, [isAuthenticated]);

  // ── Poll generation status ──
  useEffect(() => {
    if (!generationJobId || generationProgress.status === "completed" || generationProgress.status === "failed") return;
    const interval = setInterval(async () => {
      try {
        const data = await api.getGenerationStatus();
        setGenerationProgress({ total: data.total, completed: data.completed, failed: data.failed || 0, percent: data.percent, status: data.status });
        if (data.status === "completed") {
          clearInterval(interval);
          setProfile(p => ({ ...p, avatarReady: true, avatarType: "ai_video" }));
          setIsGenerating(false);
          // Fetch all video URLs
          const videosData = await api.getAvatarVideos();
          const videoMap = {};
          (videosData.videos || []).forEach(v => {
            videoMap[v.phraseId] = {
              status: v.status,
              videoUrl: v.status === "ready" ? api.getAvatarVideoUrl(v.phraseId) : null,
              audioUrl: v.audioFilename ? api.getAvatarAudioUrl(v.phraseId) : null,
            };
          });
          setAvatarVideos(videoMap);
          setSetupStep(4);
        }
      } catch (err) { console.error("Generation poll error:", err); }
    }, 3000);
    return () => clearInterval(interval);
  }, [generationJobId, generationProgress.status]);

  // ── Fetch avatar videos on login (if user has AI avatar) ──
  useEffect(() => {
    if (!isAuthenticated) return;
    api.getAvatarVideos()
      .then((data) => {
        if (data.videos && data.videos.length > 0) {
          const videoMap = {};
          data.videos.forEach(v => {
            videoMap[v.phraseId] = {
              status: v.status,
              videoUrl: (v.status === "ready") ? api.getAvatarVideoUrl(v.phraseId) : null,
              audioUrl: v.audioFilename ? api.getAvatarAudioUrl(v.phraseId) : null,
            };
          });
          setAvatarVideos(videoMap);
          if (Object.values(videoMap).some(v => v.status === "ready" || v.status === "tts_only")) {
            setProfile(p => ({ ...p, avatarType: "ai_video" }));
          }
        }
      })
      .catch(() => {});
  }, [isAuthenticated]);

  // ── Cleanup video preview blob URL ──
  useEffect(() => {
    return () => { if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl); };
  }, [videoPreviewUrl]);

  // Use API lessons if available, otherwise fallback to hardcoded
  const activeLessons = apiLessons || LESSONS;

  // ── Auth handlers ──
  const handleAuth = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      if (authMode === "register") {
        await api.register(authEmail, authPassword);
      } else {
        await api.login(authEmail, authPassword);
      }
      setIsAuthenticated(true);
      // Fetch user data after login
      try {
        const me = await api.getMe();
        if (me.profile) {
          const hasCompletedSetup = !!(me.profile.parent_name && me.profile.child_name);
          setProfile(p => ({
            ...p,
            parentName: me.profile.parent_name || p.parentName,
            childName: me.profile.child_name || p.childName,
            videoUploaded: hasCompletedSetup || p.videoUploaded,
            avatarReady: hasCompletedSetup || !!me.profile.avatar_url || p.avatarReady,
          }));
        }
        if (me.xp) setTotalXP(me.xp);
      } catch { /* proceed anyway */ }
      setScreen("welcome");
    } catch (err) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    api.clearAuth();
    setIsAuthenticated(false);
    setScreen("splash");
    setProfile({ parentName: "", childName: "", language: "Twi (Ashanti)", videoUploaded: false, avatarReady: false, avatarType: "cartoon" });
    setProgress({});
    setTotalXP(0);
    setApiLessons(null);
    setAvatarVideos({});
    setSourceVideoId(null);
    setGenerationJobId(null);
    setGenerationProgress({ total: 0, completed: 0, percent: 0, status: "idle" });
  };

  // Rate limiters — prevent abuse of speech synthesis and quiz actions
  const speakLimiter = useRef(createRateLimiter(800)).current;
  const quizLimiter = useRef(createRateLimiter(500)).current;
  const listenLimiter = useRef(createRateLimiter(2000)).current;

  useEffect(() => { if (screen === "splash") { const t = setTimeout(() => setScreen(isAuthenticated ? "welcome" : "auth"), 2400); return () => clearTimeout(t); } }, [screen, isAuthenticated]);

  // Whitelist of allowed speech content — only lesson phrases can be spoken.
  // This prevents any user-controlled text from reaching the speech API.
  const allowedSpeechSet = useMemo(() => {
    const set = new Set();
    activeLessons.forEach(l => l.phrases.forEach(p => set.add(p.twi)));
    return set;
  }, [activeLessons]);

  const speak = useCallback((text) => {
    if (!synthRef.current) return;
    // SECURITY: Only allow whitelisted lesson content to be spoken
    if (!allowedSpeechSet.has(text)) {
      console.warn("[Security] Blocked non-whitelisted speech:", text);
      return;
    }
    // SECURITY: Rate limit speech synthesis to prevent audio spam / DoS
    speakLimiter(() => {
      synthRef.current.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.85;
      u.onstart = () => { setSpeaking(true); setParentMood("neutral"); };
      u.onend = () => { setSpeaking(false); };
      synthRef.current.speak(u);
    });
  }, [allowedSpeechSet, speakLimiter]);

  const startLesson = (lesson) => {
    setCurrentLesson(lesson); setPhraseIdx(0); setPhase("watch");
    setScore(0); setPicked(null); setFeedback(false);
    setParentMood("neutral"); setScreen("lesson");
  };

  const makeQuiz = useCallback((lesson, idx) => {
    const correct = lesson.phrases[idx];
    const pool = lesson.phrases.filter((_, i) => i !== idx);
    setQuizOpts([...pool.sort(() => Math.random() - 0.5).slice(0, 2), correct].sort(() => Math.random() - 0.5));
  }, []);

  const advance = useCallback(() => {
    if (!currentLesson) return;
    setPicked(null); setFeedback(false); setParentMood("neutral");
    if (phase === "watch") setPhase("repeat");
    else if (phase === "repeat") { setPhase("quiz"); makeQuiz(currentLesson, phraseIdx); }
    else if (phase === "quiz") {
      if (phraseIdx < currentLesson.phrases.length - 1) { setPhraseIdx(i => i + 1); setPhase("watch"); }
      else {
        const lessonScore = Math.round((score / currentLesson.phrases.length) * 100);
        setTotalXP(x => x + Math.round(score * 10));
        setProgress(p => ({ ...p, [currentLesson.id]: { completed: true, score: lessonScore } }));
        setShowConfetti(true); setParentMood("celebrate");
        setTimeout(() => setShowConfetti(false), 2500);
        setScreen("results");
        // Persist progress to API
        if (isAuthenticated) {
          api.saveProgress(currentLesson.id, lessonScore)
            .then((data) => { if (data.totalXp) setTotalXP(data.totalXp); })
            .catch(() => { /* progress saved locally at minimum */ });
        }
      }
    }
  }, [currentLesson, phraseIdx, phase, score, makeQuiz]);

  const handleQuiz = useCallback((opt) => {
    if (picked) return;
    // SECURITY: Rate limit quiz answers to prevent score manipulation via rapid clicks
    quizLimiter(() => {
      setPicked(opt);
      // SECURITY: Validate that the picked option exists in the current quiz options
      const isValidOpt = quizOpts.some(q => q.twi === opt.twi);
      if (!isValidOpt) { console.warn("[Security] Invalid quiz option"); return; }
      const correct = currentLesson.phrases[phraseIdx].twi === opt.twi;
      if (correct) { setScore(s => s + 1); setParentMood("celebrate"); }
      else setParentMood("encourage");
      setFeedback(true);
      setTimeout(advance, 1400);
    });
  }, [picked, currentLesson, phraseIdx, advance, quizLimiter, quizOpts]);

  const doListen = useCallback(() => {
    // SECURITY: Rate limit microphone presses to prevent score inflation
    listenLimiter(() => {
      setListening(true); setParentMood("neutral");
      setTimeout(() => {
        setListening(false); setScore(s => s + 0.5);
        setFeedback(true); setParentMood("celebrate");
        setTimeout(advance, 1200);
      }, 2200);
    });
  }, [advance, listenLimiter]);

  const phrase = currentLesson?.phrases[phraseIdx];
  const isLessonDone = (lessonId) => {
    const p = progress[lessonId];
    return p && (p === true || p.completed === true || (typeof p === "number" && p > 0));
  };
  const completedCount = Object.keys(progress).filter(k => isLessonDone(k)).length;
  // SECURITY: Sanitize display names before rendering
  const pName = safeText(profile.parentName) || "Parent";
  const cName = safeText(profile.childName) || "Learner";
  const hasAvatar = profile.avatarReady;
  const page = { minHeight: "100vh", fontFamily: "'Inter', sans-serif", position: "relative", overflow: "hidden" };

  /* ═══ SPLASH ═══ */
  if (screen === "splash") return (
    <div style={{ ...page, background: "var(--bg-app)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
      <FloatingOrbs count={15} colors={[C.sunYellow, C.coral, C.mint, C.grape, C.sky]} />
      <div style={{ zIndex: 1, animation: "popIn 0.6s cubic-bezier(0.34,1.56,0.64,1)", textAlign: "center" }}>
        <ParentAvatar size={130} speaking={false} uploaded={false} showLabel={false} ring={false} />
        <h1 style={{ ...T.hero, color: "var(--text-primary)", margin: "20px 0 0", textShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>Ɔkasa!</h1>
        <p style={{ ...T.label, color: "var(--text-muted)", letterSpacing: 4, marginTop: 8 }}>LEARN FROM YOUR PARENT</p>
      </div>
      <Styles />
    </div>
  );

  /* ═══ AUTH (Login / Register) ═══ */
  if (screen === "auth") return (
    <div style={{ ...page, background: "var(--bg-app)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      <FloatingOrbs count={14} colors={[C.sunYellow, C.coral, C.sky, C.mint, C.grape]} />
      <button onClick={toggleTheme} style={{
        position: "absolute", top: 20, right: 20, zIndex: 10,
        width: 44, height: 44, borderRadius: R.pill,
        background: "var(--overlay-subtle)",
        border: "var(--glass-border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 20, cursor: "pointer", backdropFilter: FX.glassBlur,
      }} title={isPlayful ? "Switch to Modern Study" : "Switch to Playful Warm"}>
        {isPlayful ? '\uD83D\uDCDA' : '\uD83C\uDFA8'}
      </button>
      <div style={{ zIndex: 1, textAlign: "center", maxWidth: 420, width: "100%", animation: "popIn 0.5s cubic-bezier(0.34,1.56,0.64,1)" }}>
        <ParentAvatar size={100} speaking={false} uploaded={false} showLabel={false} ring={false} />
        <h1 style={{ ...T.headline, color: "var(--text-primary)", margin: "14px 0 4px" }}>Ɔkasa!</h1>
        <p style={{ ...T.body, color: "var(--text-secondary)", margin: "0 0 32px" }}>
          {authMode === "register" ? "Create your account to start learning" : "Welcome back, learner!"}
        </p>

        <GlassCard dark style={{ padding: "20px 22px", marginBottom: 12 }}>
          <label style={{ ...T.label, fontSize: 11, color: "var(--accent-gold)", display: "block", marginBottom: 6 }}>Email</label>
          <input
            type="email"
            value={authEmail}
            onChange={e => setAuthEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            style={{ width: "100%", ...T.body, fontSize: 18, fontWeight: 500, border: "none", outline: "none", color: "var(--text-primary)", boxSizing: "border-box", background: "transparent" }}
          />
        </GlassCard>

        <GlassCard dark style={{ padding: "20px 22px", marginBottom: 12 }}>
          <label style={{ ...T.label, fontSize: 11, color: "var(--accent-gold)", display: "block", marginBottom: 6 }}>Password</label>
          <input
            type="password"
            value={authPassword}
            onChange={e => setAuthPassword(e.target.value)}
            placeholder={authMode === "register" ? "Min 6 characters" : "Your password"}
            autoComplete={authMode === "register" ? "new-password" : "current-password"}
            onKeyDown={e => { if (e.key === "Enter" && authEmail && authPassword.length >= 6) handleAuth(); }}
            style={{ width: "100%", ...T.body, fontSize: 18, fontWeight: 500, border: "none", outline: "none", color: "var(--text-primary)", boxSizing: "border-box", background: "transparent" }}
          />
        </GlassCard>

        {authError && (
          <div style={{ padding: "10px 16px", borderRadius: R.cardSm, background: `${C.coral}20`, border: `1px solid ${C.coral}40`, marginBottom: 12 }}>
            <p style={{ margin: 0, ...T.body, fontSize: 13, fontWeight: 600, color: C.coral }}>⚠️ {authError}</p>
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          <BigBtn
            color={C.sunYellow}
            textColor={C.charcoal}
            disabled={!authEmail || authPassword.length < 6 || authLoading}
            onClick={handleAuth}
          >
            {authLoading ? "..." : authMode === "register" ? "Create Account" : "Sign In"}
          </BigBtn>
        </div>

        <button onClick={() => { setAuthMode(m => m === "login" ? "register" : "login"); setAuthError(""); }}
          style={{ background: "none", border: "none", ...T.body, color: "var(--text-secondary)", fontSize: 14, marginTop: 20, cursor: "pointer" }}>
          {authMode === "login" ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
        </button>
      </div>
      <Styles />
    </div>
  );

  /* ═══ WELCOME ═══ */
  if (screen === "welcome") return (
    <div style={{ ...page, background: "var(--bg-app)", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 24px" }}>
      <FloatingOrbs count={14} colors={[C.sunYellow, C.coral, C.sky, C.mint, C.grape]} />
      <button onClick={toggleTheme} style={{ position: "absolute", top: 20, right: 20, zIndex: 10, width: 44, height: 44, borderRadius: R.pill, background: "var(--overlay-subtle)", border: "var(--glass-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, cursor: "pointer", backdropFilter: FX.glassBlur, transition: "all 0.3s ease" }} title={isPlayful ? "Switch to Modern Study" : "Switch to Playful Warm"}>{isPlayful ? '📚' : '🎨'}</button>
      <div style={{ zIndex: 1, textAlign: "center", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", maxWidth: 420 }}>
        <div style={{ animation: "popIn 0.5s cubic-bezier(0.34,1.56,0.64,1)", position: "relative" }}>
          <ParentAvatar size={140} speaking={false} uploaded={hasAvatar} name={pName} showLabel={false} mood="celebrate" />
          <div style={{ position: "absolute", bottom: -2, right: -10 }}><BirdBuddy size={44} /></div>
        </div>
        <h1 style={{ ...T.hero, color: "var(--text-primary)", margin: "16px 0 0" }}>Ɔkasa!</h1>
        <p style={{ ...T.body, color: "var(--text-secondary)", margin: "6px 0 0" }}>
          {hasAvatar ? `${pName} is ready to teach!` : "Learn your mother tongue"}
        </p>
        <div style={{ marginTop: 48, display: "flex", flexDirection: "column", gap: 14, width: "100%", animation: "slideUp 0.6s ease 0.2s both" }}>
          <BigBtn color={C.sunYellow} textColor={C.charcoal} onClick={() => setScreen(hasAvatar ? "dashboard" : "setup")}>
            {hasAvatar ? "Start Learning" : "Get Started"}
          </BigBtn>
          {hasAvatar && (
            <BigBtn color="transparent" textColor={"var(--text-primary)"} onClick={() => { setSetupStep(1); setScreen("setup"); }} style={{ boxShadow: "none", border: "1.5px solid var(--overlay-strong)", height: 48 }}>
              Parent Settings
            </BigBtn>
          )}
        </div>
      </div>
      <Styles />
    </div>
  );

  /* ═══ SETUP ═══ */
  if (screen === "setup") return (
    <div style={{ ...page, background: "var(--bg-app)", padding: "24px 24px 40px", display: "flex", flexDirection: "column" }}>
      <FloatingOrbs count={8} colors={[C.sunYellow, C.grape, C.sky]} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, zIndex: 1 }}>
        <button onClick={() => setupStep > 1 ? setSetupStep(s => s - 1) : setScreen("welcome")}
          style={{ background: "var(--overlay-subtle)", border: "var(--glass-border)", borderRadius: R.pill, width: 48, height: 48, padding: 0, cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 18, color: "var(--text-primary)", backdropFilter: FX.glassBlur, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
        <div style={{ display: "flex", gap: 6 }}>
          {[1,2,3,4].map(i => <div key={i} style={{ width: i === setupStep ? 32 : 10, height: 10, borderRadius: R.pill, background: i <= setupStep ? "var(--accent-gold)" : "var(--overlay-medium)", transition: "all 0.4s cubic-bezier(0.34,1.56,0.64,1)" }} />)}
        </div>
        <button onClick={toggleTheme} style={{ background: "var(--overlay-subtle)", border: "var(--glass-border)", borderRadius: R.pill, width: 48, height: 48, padding: 0, cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 20, backdropFilter: FX.glassBlur, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s ease" }} title={isPlayful ? "Switch to Modern Study" : "Switch to Playful Warm"}>{isPlayful ? '📚' : '🎨'}</button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", maxWidth: 500, margin: "0 auto", width: "100%", zIndex: 1 }}>
        {/* Step 1 */}
        {setupStep === 1 && (
          <div style={{ width: "100%", animation: "slideUp 0.4s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <ParentAvatar size={90} uploaded={false} showLabel={false} ring={false} />
              <h2 style={{ ...T.subhead, color: "var(--text-primary)", margin: "12px 0 4px" }}>Create your AI tutor</h2>
              <p style={{ ...T.body, color: "var(--text-secondary)", fontSize: 14 }}>Your child will learn directly from you!</p>
            </div>
            {[
              { label: "Your Name", key: "parentName", placeholder: "e.g. Ama" },
              { label: "Child's Name", key: "childName", placeholder: "e.g. Kofi" },
            ].map(f => (
              <GlassCard key={f.key} dark style={{ padding: "16px 22px", marginBottom: 12, border: inputErrors[f.key] ? `1px solid ${C.coral}` : undefined }}>
                <label style={{ ...T.label, fontSize: 11, color: "var(--accent-gold)", display: "block", marginBottom: 6 }}>{f.label}</label>
                <input
                  value={profile[f.key]}
                  maxLength={30}
                  onChange={e => {
                    // SECURITY: Sanitize input on every keystroke
                    const sanitized = sanitizeInput(e.target.value, 30);
                    setProfile(p => ({ ...p, [f.key]: sanitized }));
                    // Validate and show error if invalid
                    if (sanitized && !isValidName(sanitized)) {
                      setInputErrors(prev => ({ ...prev, [f.key]: "Letters, spaces, hyphens only" }));
                    } else {
                      setInputErrors(prev => { const n = { ...prev }; delete n[f.key]; return n; });
                    }
                  }}
                  placeholder={f.placeholder}
                  autoComplete="off"
                  spellCheck="false"
                  style={{ width: "100%", ...T.body, fontSize: 18, fontWeight: 500, border: "none", outline: "none", color: "var(--text-primary)", boxSizing: "border-box", background: "transparent" }}
                />
                {inputErrors[f.key] && (
                  <p style={{ margin: "6px 0 0", ...T.body, fontSize: 11, color: C.coral, fontWeight: 600 }}>⚠️ {inputErrors[f.key]}</p>
                )}
              </GlassCard>
            ))}
            <GlassCard dark style={{ padding: "16px 22px", marginBottom: 12 }}>
              <label style={{ ...T.label, fontSize: 11, color: "var(--accent-gold)", display: "block", marginBottom: 6 }}>Language</label>
              <select value={profile.language} onChange={e => {
                  // SECURITY: Only accept whitelisted language values
                  const allowed = ["Twi (Ashanti)","Twi (Akuapem)","Fante","Ga","Ewe","Yoruba","Igbo","Hausa"];
                  if (allowed.includes(e.target.value)) {
                    setProfile(p => ({ ...p, language: e.target.value }));
                  }
                }}
                style={{ width: "100%", ...T.body, fontSize: 18, fontWeight: 500, border: "none", outline: "none", color: "var(--text-primary)", background: "transparent", boxSizing: "border-box" }}>
                {["Twi (Ashanti)","Twi (Akuapem)","Fante","Ga","Ewe","Yoruba","Igbo","Hausa"].map(l => <option key={l} style={{ background: "var(--option-bg)", color: "var(--text-primary)" }}>{l}</option>)}
              </select>
            </GlassCard>
            <div style={{ marginTop: 24 }}>
              <BigBtn disabled={!isValidName(profile.parentName) || !isValidName(profile.childName) || Object.keys(inputErrors).length > 0} onClick={() => setSetupStep(2)}>Continue →</BigBtn>
            </div>
          </div>
        )}
        {/* Step 2 — Video Upload */}
        {setupStep === 2 && (
          <div style={{ width: "100%", textAlign: "center", animation: "slideUp 0.4s ease" }}>
            <ParentAvatar size={120} uploaded={false} showLabel={false} ring={false} />
            <h2 style={{ ...T.subhead, color: "var(--text-primary)", margin: "16px 0 4px" }}>Record yourself</h2>
            <p style={{ ...T.body, color: "var(--text-secondary)", fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
              Speak naturally for 10-30 seconds — greet {profile.childName}, count, say family names.
            </p>

            {/* Video preview (after file selected) */}
            {videoPreviewUrl && (
              <GlassCard dark style={{ padding: 0, marginBottom: 16, overflow: "hidden", borderRadius: R.cardMd }}>
                <video src={videoPreviewUrl} controls playsInline
                  style={{ width: "100%", maxHeight: 280, objectFit: "cover", borderRadius: R.cardMd }} />
                <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ ...T.body, fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
                    {videoFile?.name} ({(videoFile?.size / (1024 * 1024)).toFixed(1)}MB)
                  </p>
                  <button onClick={() => { setVideoFile(null); setVideoPreviewUrl(null); setUploadProgress(0); }}
                    style={{ background: "none", border: "none", color: C.coral, cursor: "pointer", ...T.label, fontSize: 11 }}>
                    Remove
                  </button>
                </div>
              </GlassCard>
            )}

            {/* Upload area (before file selected) */}
            {!videoPreviewUrl && (
              <GlassCard dark style={{ border: "2px dashed var(--overlay-strong)", padding: "44px 24px", cursor: "pointer", position: "relative" }}>
                <input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > 50 * 1024 * 1024) { alert("Video must be under 50MB"); return; }
                    setVideoFile(file);
                    setVideoPreviewUrl(URL.createObjectURL(file));
                  }}
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg, ${C.accentCoral}, ${C.energy})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: C.white, boxShadow: "var(--pill-shadow)" }}>📹</div>
                  <p style={{ ...T.pill, color: "var(--text-primary)", margin: 0, fontSize: 16 }}>Tap to Record or Upload</p>
                  <p style={{ ...T.body, fontSize: 12, color: "var(--text-muted)", margin: 0 }}>MP4, MOV, or WebM up to 50MB</p>
                </div>
              </GlassCard>
            )}

            {/* Upload progress bar */}
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ height: 6, borderRadius: R.pill, background: "var(--overlay-subtle)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: R.pill, background: "var(--accent-gold)", width: `${uploadProgress}%`, transition: "width 0.3s ease" }} />
                </div>
                <p style={{ ...T.body, fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>Uploading... {uploadProgress}%</p>
              </div>
            )}

            {/* Continue button (only when video selected) */}
            {videoPreviewUrl && uploadProgress === 0 && (
              <div style={{ marginTop: 20 }}>
                <BigBtn color={C.sunYellow} textColor={C.charcoal} onClick={async () => {
                  try {
                    setUploadProgress(1);
                    const result = await api.uploadVideo(videoFile, setUploadProgress);
                    setSourceVideoId(result.sourceVideoId);
                    setProfile(p => ({ ...p, videoUploaded: true }));
                    setUploadProgress(100);
                    setTimeout(() => { setUploadProgress(0); setSetupStep(3); }, 500);
                  } catch (err) {
                    alert(err.message || "Upload failed. Please try again.");
                    setUploadProgress(0);
                  }
                }}>Upload & Continue →</BigBtn>
              </div>
            )}

            <GlassCard dark style={{ marginTop: 16, padding: 14, textAlign: "left" }}>
              <p style={{ margin: 0, ...T.body, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
                💡 <strong style={{ color: "var(--accent-gold)" }}>Tips:</strong> Good lighting, face the camera, speak in {profile.language} and English.
              </p>
            </GlassCard>
          </div>
        )}
        {/* Step 3 — AI Generation */}
        {setupStep === 3 && (
          <div style={{ width: "100%", textAlign: "center", animation: "slideUp 0.4s ease" }}>
            <div style={{ marginBottom: 24 }}>
              <ParentAvatar size={160} uploaded={!isGenerating} name={pName} showLabel={false}
                speaking={isGenerating} mood={isGenerating ? "neutral" : "celebrate"} />
            </div>
            <h2 style={{ ...T.subhead, color: "var(--text-primary)", marginBottom: 8 }}>
              {isGenerating ? "Building your AI twin..." : "Video received!"}
            </h2>
            <p style={{ ...T.body, color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
              {isGenerating
                ? `Generating lesson videos (${generationProgress.completed}/${generationProgress.total})...`
                : `Ready to generate ${pName}'s AI tutor for all lessons.`}
            </p>

            {/* Real progress bar during generation */}
            {isGenerating && (
              <>
                <div style={{ padding: "0 20px", marginBottom: 16 }}>
                  <div style={{ height: 8, borderRadius: R.pill, background: "var(--overlay-subtle)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: R.pill,
                      background: "linear-gradient(90deg, var(--accent-gold), #FF7E5F)",
                      width: `${generationProgress.percent}%`,
                      transition: "width 0.6s ease",
                    }} />
                  </div>
                  <p style={{ ...T.label, color: "var(--text-muted)", marginTop: 8 }}>
                    {generationProgress.percent}% complete
                  </p>
                </div>
                <div style={{ display: "flex", gap: 4, justifyContent: "center", marginBottom: 24 }}>
                  {[0,1,2,3,4].map(i => (
                    <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: C.sunYellow, animation: `dotBounce 1.2s ease-in-out ${i * 0.15}s infinite` }} />
                  ))}
                </div>
                <p style={{ ...T.body, fontSize: 12, color: "var(--text-muted)" }}>
                  This may take a few minutes. You can leave this screen open.
                </p>
              </>
            )}

            {!isGenerating && (
              <BigBtn color={C.sunYellow} textColor={C.charcoal} onClick={async () => {
                try {
                  setIsGenerating(true);
                  const result = await api.startGeneration(sourceVideoId);
                  setGenerationJobId(result.jobId);
                  setGenerationProgress({ total: result.totalPhrases, completed: 0, percent: 0, status: "processing" });
                } catch (err) {
                  setIsGenerating(false);
                  alert(err.message || "Generation failed. Please try again.");
                }
              }}>✨ Generate AI Tutor</BigBtn>
            )}
          </div>
        )}
        {/* Step 4 */}
        {setupStep === 4 && (
          <div style={{ width: "100%", textAlign: "center", animation: "popIn 0.5s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <ParentAvatar size={150} uploaded={true} name={pName} mood="celebrate" speaking={false} />
            <div style={{ marginTop: 12 }}>
              <SpeechBubble text={`Hi ${cName}! I'm going to teach you ${profile.language}! 🇬🇭`} dark size="lg" />
            </div>
            <h2 style={{ ...T.headline, fontSize: 32, color: "var(--text-primary)", margin: "20px 0 4px" }}>Tutor Ready!</h2>
            <p style={{ ...T.body, color: "var(--text-secondary)", fontSize: 15, marginBottom: 32 }}>
              {pName}'s AI will teach {cName} across every lesson
            </p>
            <BigBtn color={C.sunYellow} onClick={() => {
              // Save profile to API
              if (isAuthenticated) {
                api.updateProfile({
                  childName: profile.childName,
                  parentName: profile.parentName,
                  language: "twi",
                }).catch(() => {});
              }
              setScreen("dashboard");
            }}>
              🎮 Start {cName}'s Journey!
            </BigBtn>
          </div>
        )}
      </div>
      <Styles />
    </div>
  );

  /* ═══ DASHBOARD (Editorial Mood) ═══ */
  if (screen === "dashboard") return (
    <div style={{ ...page, background: "var(--bg-app)", paddingBottom: 100 }}>
      <FloatingOrbs count={16} colors={[C.sunYellow, C.mint, C.sky, C.coral, C.grape]} />
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ padding: "44px 24px 0", display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <button onClick={handleLogout} style={{ width: 48, height: 48, borderRadius: R.pill, background: "var(--overlay-subtle)", backdropFilter: FX.glassBlur, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "var(--text-secondary)", border: "var(--glass-border)", cursor: "pointer", fontFamily: "'Inter', sans-serif" }} title="Sign Out">🚪</button>
          <button onClick={toggleTheme} style={{ width: 48, height: 48, borderRadius: R.pill, background: "var(--overlay-subtle)", backdropFilter: FX.glassBlur, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, border: "var(--glass-border)", cursor: "pointer", fontFamily: "'Inter', sans-serif", transition: "all 0.3s ease" }} title={isPlayful ? "Switch to Modern Study" : "Switch to Playful Warm"}>{isPlayful ? '📚' : '🎨'}</button>
          <div style={{ flex: 1 }} />
          <XPBadge xp={totalXP} dark />
          <ParentAvatar size={44} uploaded={hasAvatar} name={pName} showLabel={false} ring={false} mood="celebrate" />
        </div>

        {/* Title section */}
        <div style={{ padding: "0 24px", marginBottom: 8 }}>
          <h1 style={{ ...T.hero, color: "var(--text-primary)", margin: 0, lineHeight: 0.92 }}>
            Mother<br/>Tongue<br/>
            <span style={{ color: "var(--accent-gold)" }}>Explorer</span>
          </h1>
          <p style={{ ...T.body, color: "var(--text-secondary)", margin: "12px 0 0" }}>
            Hey {cName}! {pName} has {activeLessons.length - completedCount} lessons waiting
          </p>
        </div>

        {/* Horizontal lesson carousel (Space Explorer planet cards) */}
        <div ref={carouselRef} style={{
          display: "flex", gap: 16, padding: "28px 24px 20px", overflowX: "auto",
          scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none", msOverflowStyle: "none",
        }}>
          {activeLessons.map((lesson, idx) => {
            const done = isLessonDone(lesson.id);
            const isNext = !done && (idx === 0 || isLessonDone(activeLessons[idx - 1]?.id));
            return (
              <div key={lesson.id} onClick={() => startLesson(lesson)} style={{
                minWidth: 220, scrollSnapAlign: "start", cursor: "pointer",
                animation: `slideUp 0.5s ease ${idx * 0.1}s both`,
              }}>
                <div style={{
                  borderRadius: R.cardMd, padding: "24px 20px 20px", position: "relative", overflow: "hidden",
                  background: done ? "var(--bg-card)" : isNext ? "var(--bg-card-hover)" : "var(--bg-card)",
                  border: isNext ? `1.5px solid ${lesson.color}40` : "var(--card-border)",
                  backdropFilter: FX.glassBlur,
                  boxShadow: "var(--card-shadow)",
                  transition: "all 0.3s ease",
                }}>
                  {/* Decorative large number */}
                  <span style={{
                    position: "absolute", top: -8, right: 8, fontFamily: "'Nunito', sans-serif", fontSize: 80,
                    color: "var(--overlay-subtle)", lineHeight: 1, pointerEvents: "none",
                  }}>{idx + 1}</span>
                  {/* Floating emoji */}
                  <div style={{
                    width: 64, height: 64, borderRadius: R.cardSm,
                    background: `linear-gradient(135deg, ${lesson.color}25, ${lesson.color}10)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 32, marginBottom: 16,
                    boxShadow: `0 4px 16px ${lesson.color}15`,
                    border: `1px solid ${lesson.color}20`,
                  }}>
                    {done ? "✅" : lesson.icon}
                  </div>
                  <h3 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>{lesson.title}</h3>
                  <p style={{ ...T.body, fontSize: 13, color: "var(--text-secondary)", margin: "0 0 16px", lineHeight: 1.4 }}>
                    {lesson.subtitle} · {lesson.phrases.length} words
                  </p>
                  {/* Arrow button */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ ...T.label, fontSize: 11, color: lesson.color }}>
                      {done ? "Completed" : isNext ? "Next up" : `Level ${lesson.difficulty}`}
                    </span>
                    <RoundBtn onClick={() => startLesson(lesson)} color={lesson.color} size={40} icon="→" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Parent greeting card */}
        <div style={{ padding: "0 24px", marginBottom: 20 }}>
          <GlassCard dark style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ParentAvatar size={60} uploaded={hasAvatar} name={pName} showLabel={false} ring={false} mood="celebrate" />
              <div style={{ flex: 1 }}>
                <SpeechBubble
                  text={completedCount === 0 ? `Let's start learning ${profile.language} together!` : `${completedCount} lessons done! Keep going, ${cName}!`}
                  dark size="sm" animate={false} />
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 10, padding: "0 24px", marginBottom: 20 }}>
          {[
            { icon: "📖", val: completedCount, label: "Done", col: C.mint },
            { icon: "🔥", val: completedCount, label: "Streak", col: C.tangerine },
            { icon: "🌟", val: activeLessons.length - completedCount, label: "Left", col: C.sky },
          ].map(s => (
            <GlassCard key={s.label} dark style={{ flex: 1, padding: 14, textAlign: "center" }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <p style={{ fontFamily: "'Nunito', sans-serif", fontSize: 28, fontWeight: 400, color: s.col, margin: "2px 0" }}>{s.val}</p>
              <p style={{ ...T.label, fontSize: 10, color: "var(--text-muted)", margin: 0 }}>{s.label}</p>
            </GlassCard>
          ))}
        </div>

        {/* Friends online bar (social element from Space Explorer) */}
        <div style={{ padding: "0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex" }}>
              {["🧒🏿","👧🏾","🧒🏽"].map((e, i) => (
                <div key={i} style={{
                  width: 30, height: 30, borderRadius: "50%", background: "var(--overlay-subtle)",
                  border: "2px solid var(--overlay-medium)", marginLeft: i > 0 ? -8 : 0,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                }}>{e}</div>
              ))}
            </div>
            <p style={{ ...T.body, fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              {cName} and friends are learning
            </p>
          </div>
        </div>
      </div>
      {/* ── Bottom Nav Glass Bar ── */}
      <div style={{
        position: "fixed", bottom: 16, left: 16, right: 16, height: 64,
        borderRadius: R.bottomNav, background: "var(--glass-bg)", backdropFilter: FX.glassBlur,
        border: "var(--glass-border)", display: "flex", alignItems: "center", justifyContent: "space-around",
        zIndex: 20, padding: "0 8px", animation: "fadeInUp 0.4s ease 0.3s both",
      }}>
        {[
          { icon: "🏠", label: "Home", action: () => {}, active: screen === "dashboard" },
          { icon: "📊", label: "Progress", action: () => setScreen("progress"), active: false },
          { icon: "⚙️", label: "Settings", action: () => { setSetupStep(1); setScreen("setup"); }, active: false },
          { icon: isPlayful ? "\uD83D\uDCDA" : "\uD83C\uDFA8", label: isPlayful ? "Study" : "Playful", action: toggleTheme, active: false },
        ].map((tab) => (
          <button key={tab.label} onClick={tab.action} style={{
            background: "none", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            padding: "8px 20px", fontFamily: "'Inter', sans-serif",
            opacity: tab.active ? 1 : 0.5, transition: "opacity 0.2s ease",
          }}>
            <span style={{ fontSize: 22 }}>{tab.icon}</span>
            <span style={{ ...T.label, fontSize: 10, color: tab.active ? "var(--accent-gold)" : "var(--text-muted)" }}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>
      <Styles />
    </div>
  );

  /* ═══ LESSON (Detail view — Editorial Mood) ═══ */
  if (screen === "lesson" && currentLesson && phrase) return (
    <div style={{ ...page, background: "var(--bg-app)", display: "flex", flexDirection: "column" }}>
      <FloatingOrbs count={8} colors={[currentLesson.color, C.grape, C.sky]} />
      {/* Header */}
      <div style={{ padding: "28px 24px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 2 }}>
        <button onClick={() => setScreen("dashboard")} style={{
          background: "var(--overlay-subtle)", border: "var(--glass-border)",
          borderRadius: R.pill, width: 48, height: 48, padding: 0, cursor: "pointer", fontSize: 18,
          color: "var(--text-primary)", fontFamily: "'Inter', sans-serif", fontWeight: 600, backdropFilter: FX.glassBlur,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>←</button>
        <p style={{ margin: 0, ...T.label, color: "var(--text-secondary)" }}>{phraseIdx + 1} / {currentLesson.phrases.length}</p>
        <XPBadge xp={Math.round(score * 10)} dark />
      </div>
      {/* Progress bar */}
      <div style={{ padding: "0 24px 16px", zIndex: 2 }}>
        <div style={{ height: 4, borderRadius: R.pill, background: "var(--overlay-subtle)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: R.pill,
            background: `linear-gradient(90deg, ${currentLesson.color}, ${currentLesson.color}CC)`,
            transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
            width: `${((phraseIdx * 3 + (phase === "watch" ? 0 : phase === "repeat" ? 1 : 2)) / (currentLesson.phrases.length * 3)) * 100}%`,
          }} />
        </div>
      </div>

      {/* Floating emoji (like the 3D planet) */}
      <div style={{ textAlign: "center", zIndex: 2, padding: "0 24px", marginBottom: -20 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 100, height: 100, borderRadius: R.panel,
          background: `radial-gradient(circle at 30% 30%, ${currentLesson.color}30, ${currentLesson.color}08)`,
          boxShadow: `0 12px 40px ${currentLesson.color}20`,
          fontSize: 52, animation: "floatEmoji 4s ease-in-out infinite",
        }}>
          {phrase.emoji}
        </div>
      </div>

      {/* Content card (dark editorial surface) */}
      <div style={{
        flex: 1, background: "var(--bg-card)", borderRadius: `${R.cardLg}px ${R.cardLg}px 0 0`,
        padding: "40px 24px 28px", display: "flex", flexDirection: "column", alignItems: "center",
        zIndex: 1, boxShadow: "0 -4px 24px rgba(0,0,0,0.06)",
        marginTop: 10, border: "var(--card-border)", borderBottom: "none",
      }}>
        {/* Avatar + speech */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, width: "100%" }}>
          {phase === "watch" && avatarVideos[phrase.id] ? (
            <VideoAvatar
              phraseId={phrase.id}
              videoUrl={avatarVideos[phrase.id]?.videoUrl}
              audioUrl={avatarVideos[phrase.id]?.audioUrl}
              videoStatus={avatarVideos[phrase.id]?.status}
              size={56}
              name={pName}
              hasAvatar={hasAvatar}
              fallbackSpeaking={speaking}
              fallbackMood={parentMood}
            />
          ) : (
            <ParentAvatar size={56} uploaded={hasAvatar} name={pName} speaking={speaking}
              mood={feedback && phase === "quiz" && picked && currentLesson.phrases[phraseIdx].twi === picked.twi ? "celebrate" : feedback && phase === "repeat" ? "celebrate" : parentMood}
              showLabel={false} ring={true} />
          )}
          <div style={{ flex: 1 }}>
            {phase === "watch" && <SpeechBubble text={`Listen carefully, ${cName}!`} size="sm" animate={false} />}
            {phase === "repeat" && !listening && !feedback && <SpeechBubble text="Now say it back to me!" size="sm" animate={false} />}
            {phase === "repeat" && listening && <SpeechBubble text="I'm listening..." color={`${C.mint}15`} size="sm" animate={false} />}
            {phase === "repeat" && feedback && <SpeechBubble text={`Wo ho yɛ! Great job!`} color={`${C.mint}15`} textColor={C.leaf} size="sm" />}
            {phase === "quiz" && !feedback && <SpeechBubble text="Pick the right answer!" size="sm" animate={false} />}
            {phase === "quiz" && feedback && picked && currentLesson.phrases[phraseIdx].twi === picked.twi && (
              <SpeechBubble text="Yes! Correct! 🎉" color={`${C.mint}15`} textColor={C.leaf} size="sm" />
            )}
            {phase === "quiz" && feedback && picked && currentLesson.phrases[phraseIdx].twi !== picked.twi && (
              <SpeechBubble text="Not quite — next time!" color={`${C.coral}12`} textColor={C.coral} size="sm" />
            )}
          </div>
        </div>

        {/* WATCH */}
        {phase === "watch" && (
          <div style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <h2 style={{ fontFamily: "'Nunito', sans-serif", fontSize: 48, fontWeight: 400, color: "var(--text-primary)", margin: "0 0 6px", letterSpacing: -2 }}>{phrase.twi}</h2>
            <p style={{ ...T.body, fontSize: 17, color: currentLesson.color, fontWeight: 600, margin: "0 0 12px" }}>/{phrase.phonetic}/</p>
            <div style={{ background: "var(--overlay-subtle)", padding: "12px 28px", borderRadius: R.pill }}>
              <p style={{ ...T.body, fontWeight: 600, color: "var(--text-primary)", margin: 0, fontSize: 18 }}>{phrase.english}</p>
            </div>
            <p style={{ ...T.body, fontSize: 13, color: "var(--text-muted)", fontStyle: "italic", margin: "14px 0 0" }}>💡 {phrase.context}</p>
          </div>
        )}

        {/* REPEAT */}
        {phase === "repeat" && (
          <div style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <p style={{ fontFamily: "'Nunito', sans-serif", fontSize: 32, fontWeight: 400, color: "var(--text-primary)", margin: "0 0 24px" }}>"{phrase.twi}"</p>
            {!listening && !feedback && (
              <button onClick={doListen} style={{
                width: 90, height: 90, borderRadius: "50%", border: "none",
                background: `linear-gradient(135deg, ${C.accentCoral}, ${C.energy})`, color: C.white,
                fontSize: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "var(--pill-shadow)",
                animation: "gentlePulse 2s ease-in-out infinite",
              }}>🎤</button>
            )}
            {listening && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 90, height: 90, borderRadius: "50%", background: `${C.coral}12`, display: "flex", alignItems: "center", justifyContent: "center", animation: "gentlePulse 0.8s ease-in-out infinite" }}>
                  <span style={{ fontSize: 36 }}>🎤</span>
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center", height: 32 }}>
                  {[1,2,3,4,5,4,3,2,1].map((h, i) => (
                    <div key={i} style={{ width: 5, borderRadius: 3, background: C.coral, animation: `soundWave 0.6s ease-in-out ${i * 0.08}s infinite alternate`, height: h * 5 }} />
                  ))}
                </div>
              </div>
            )}
            {feedback && (
              <div style={{ padding: 24, borderRadius: R.cardMd, background: `${C.mint}10`, border: `1.5px solid ${C.mint}40`, animation: "popIn 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}>
                <span style={{ fontSize: 44 }}>🎉</span>
                <p style={{ ...T.pill, fontSize: 20, color: C.accentTeal, margin: "6px 0 0" }}>Awesome!</p>
              </div>
            )}
          </div>
        )}

        {/* QUIZ */}
        {phase === "quiz" && (
          <div style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", animation: "popIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <p style={{ fontFamily: "'Nunito', sans-serif", fontSize: 34, fontWeight: 400, color: "var(--text-primary)", margin: "0 0 20px" }}>"{phrase.twi}"</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
              {quizOpts.map((opt, i) => {
                const isCorrect = opt.twi === phrase.twi;
                const isPicked = picked?.twi === opt.twi;
                let bg = "var(--overlay-subtle)", border = "var(--overlay-medium)", shadow = "none";
                if (feedback && isCorrect) { bg = `${C.accentTeal}15`; border = C.accentTeal; shadow = `0 3px 12px ${C.accentTeal}20`; }
                else if (feedback && isPicked && !isCorrect) { bg = `${C.accentCoral}12`; border = C.accentCoral; shadow = `0 3px 12px ${C.accentCoral}20`; }
                return (
                  <button key={i} onClick={() => handleQuiz(opt)} style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "15px 18px",
                    borderRadius: R.cardSm, border: `1.5px solid ${border}`, background: bg,
                    cursor: picked ? "default" : "pointer", fontFamily: "'Inter', sans-serif",
                    ...T.body, fontSize: 16, fontWeight: 600, color: "var(--text-primary)", width: "100%",
                    boxShadow: shadow, transition: "all 0.2s ease",
                    opacity: feedback && !isCorrect && !isPicked ? 0.4 : 1,
                  }}>
                    <span style={{ fontSize: 24 }}>{opt.emoji}</span>
                    <span style={{ flex: 1, textAlign: "left" }}>{opt.english}</span>
                    {feedback && isCorrect && <span style={{ fontSize: 20 }}>✅</span>}
                    {feedback && isPicked && !isCorrect && <span style={{ fontSize: 20 }}>❌</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom actions */}
        <div style={{ width: "100%", paddingTop: 16, display: "flex", gap: 12 }}>
          <button onClick={() => {
            // If we have TTS audio for this phrase, play it; otherwise use browser TTS
            if (avatarVideos[phrase.id]?.audioUrl) {
              const audio = new Audio(avatarVideos[phrase.id].audioUrl);
              audio.play().catch(() => speak(phrase.twi));
            } else {
              speak(phrase.twi);
            }
          }} style={{
            flex: 1, padding: 0, height: 48, borderRadius: R.pill,
            border: "1.5px solid var(--overlay-strong)", background: "transparent",
            ...T.pill, color: "var(--text-primary)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: "none",
          }}>🔊 Hear {pName}</button>
          {phase === "watch" && (
            <BigBtn color={currentLesson.color} textColor={C.charcoal} onClick={advance} style={{ flex: 1 }}>
              Next →
            </BigBtn>
          )}
        </div>
      </div>
      <Styles />
    </div>
  );

  /* ═══ RESULTS ═══ */
  if (screen === "results") return (
    <div style={{ ...page, background: "var(--bg-app)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", textAlign: "center" }}>
      <Confetti active={showConfetti} />
      <FloatingOrbs count={10} colors={[C.sunYellow, C.mint, C.grape, C.coral]} />
      <div style={{ zIndex: 2, animation: "popIn 0.5s cubic-bezier(0.34,1.56,0.64,1)", maxWidth: 420, width: "100%" }}>
        <ParentAvatar size={120} uploaded={hasAvatar} name={pName} mood="celebrate" speaking={false} />
        <div style={{ marginTop: 10 }}>
          <SpeechBubble text={`I'm so proud of you, ${cName}! Medaase!`} dark size="lg" />
        </div>
        <h1 style={{ ...T.headline, color: "var(--text-primary)", margin: "20px 0 0" }}>Lesson Complete!</h1>
        <p style={{ ...T.body, color: "var(--text-secondary)", margin: "6px 0 0" }}>{currentLesson?.title} — {currentLesson?.subtitle}</p>

        <GlassCard dark style={{ marginTop: 24, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
            {[1,2,3].map(i => {
              const earned = i <= Math.min(3, Math.round((score / (currentLesson?.phrases.length || 1)) * 3));
              return <span key={i} style={{ fontSize: 40, filter: earned ? "none" : "grayscale(1) opacity(0.2)", animation: earned ? `popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.2}s both` : "none", display: "inline-block" }}>⭐</span>;
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 32 }}>
            <div>
              <p style={{ fontFamily: "'Nunito', sans-serif", fontSize: 32, fontWeight: 400, color: "var(--accent-gold)", margin: "0 0 2px" }}>+{Math.round(score * 10)}</p>
              <p style={{ ...T.label, fontSize: 11, color: "var(--text-muted)", margin: 0 }}>XP</p>
            </div>
            <div>
              <p style={{ fontFamily: "'Nunito', sans-serif", fontSize: 32, fontWeight: 400, color: C.accentTeal, margin: "0 0 2px" }}>{currentLesson?.phrases.length}</p>
              <p style={{ ...T.label, fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Words</p>
            </div>
          </div>
        </GlassCard>

        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <BigBtn color="transparent" textColor={"var(--text-primary)"} onClick={() => startLesson(currentLesson)} style={{ flex: 1, boxShadow: "none", border: "1.5px solid var(--overlay-strong)" }}>Again</BigBtn>
          <BigBtn color={C.sunYellow} textColor={C.charcoal} onClick={() => setScreen("dashboard")} style={{ flex: 1 }}>Explore</BigBtn>
        </div>
      </div>
      <Styles />
    </div>
  );

  /* ═══ PROGRESS ═══ */
  if (screen === "progress") return (
    <div style={{ ...page, background: "var(--bg-app)", padding: "24px 24px 40px" }}>
      <FloatingOrbs count={8} colors={[C.sunYellow, C.grape, C.sky]} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <button onClick={() => setScreen("dashboard")} style={{ background: "var(--overlay-subtle)", border: "var(--glass-border)", borderRadius: R.pill, width: 48, height: 48, padding: 0, cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: 18, marginBottom: 20, color: "var(--text-primary)", backdropFilter: FX.glassBlur, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>←</button>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <ParentAvatar size={90} uploaded={hasAvatar} name={pName} mood="celebrate" showLabel={true} />
          <h2 style={{ ...T.subhead, color: "var(--text-primary)", margin: "12px 0 4px" }}>{cName}'s Progress</h2>
          <XPBadge xp={totalXP} dark />
        </div>
        {activeLessons.map((lesson, idx) => {
          const done = isLessonDone(lesson.id);
          return (
            <GlassCard key={lesson.id} dark style={{ marginBottom: 12, padding: 18, animation: `slideUp 0.4s ease ${idx * 0.08}s both` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: R.cardSm, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, background: done ? `${lesson.color}15` : "var(--overlay-subtle)", border: `1.5px solid ${done ? lesson.color : "var(--overlay-medium)"}` }}>
                  {done ? "✅" : lesson.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 600, fontSize: 15, color: "var(--text-primary)", margin: "0 0 6px" }}>{lesson.title} — {lesson.subtitle}</p>
                  <div style={{ height: 4, borderRadius: R.pill, background: "var(--overlay-subtle)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: R.pill, background: `linear-gradient(90deg, ${lesson.color}, ${lesson.color}AA)`, width: done ? "100%" : "0%", transition: "width 0.6s ease" }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 2 }}>
                  {[1,2,3].map(i => <span key={i} style={{ fontSize: 14, filter: done ? "none" : "grayscale(1) opacity(0.2)" }}>⭐</span>)}
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>
      <Styles />
    </div>
  );

  return <div style={page}><Styles /></div>;
}

function Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; }
      :root, [data-theme="playfulWarm"] {
        --bg-app: #FBF8F2;
        --bg-card: #FFFFFF;
        --bg-card-hover: #F5EFE3;
        --text-primary: #1F2430;
        --text-secondary: #5A6478;
        --text-muted: #8B92A0;
        --accent-gold: #F5C84C;
        --accent-purple: #6558F5;
        --glass-bg: rgba(255,255,255,0.85);
        --glass-border: 1px solid rgba(31,36,48,0.06);
        --card-border: 1px solid rgba(31,36,48,0.05);
        --card-shadow: 0 4px 20px rgba(31,36,48,0.06);
        --pill-shadow: 0 2px 10px rgba(31,36,48,0.08);
        --overlay-subtle: rgba(31,36,48,0.03);
        --overlay-medium: rgba(31,36,48,0.05);
        --overlay-strong: rgba(31,36,48,0.08);
        --placeholder-color: rgba(90,100,120,0.4);
        --option-bg: #FFFFFF;
        --input-bg: #F5EFE3;
        --progress-track: rgba(31,36,48,0.06);
        --hero-gradient: linear-gradient(180deg, #FBF8F2 0%, #F5EFE3 100%);
        --orb-opacity: 0.12;
      }
      [data-theme="modernStudy"] {
        --bg-app: #EFEBF5;
        --bg-card: #FFFFFF;
        --bg-card-hover: #F3F0FA;
        --text-primary: #1F2430;
        --text-secondary: #5A6478;
        --text-muted: #8B92A0;
        --accent-gold: #6558F5;
        --accent-purple: #6558F5;
        --glass-bg: rgba(255,255,255,0.90);
        --glass-border: 1px solid rgba(101,88,245,0.10);
        --card-border: 1px solid rgba(101,88,245,0.06);
        --card-shadow: 0 4px 24px rgba(101,88,245,0.08);
        --pill-shadow: 0 2px 12px rgba(101,88,245,0.10);
        --overlay-subtle: rgba(101,88,245,0.04);
        --overlay-medium: rgba(101,88,245,0.06);
        --overlay-strong: rgba(101,88,245,0.10);
        --placeholder-color: rgba(90,100,120,0.4);
        --option-bg: #FFFFFF;
        --input-bg: #F3F0FA;
        --progress-track: rgba(101,88,245,0.08);
        --hero-gradient: linear-gradient(180deg, #EFEBF5 0%, #E5E0F5 100%);
        --orb-opacity: 0.10;
      }
      body { background: var(--bg-app); transition: background 0.3s ease, color 0.2s ease; }
      ::-webkit-scrollbar { display: none; }
      ::placeholder { color: var(--placeholder-color); }
      @keyframes birdBob { 0%, 100% { transform: translateY(0) rotate(0deg); } 25% { transform: translateY(-5px) rotate(-2deg); } 75% { transform: translateY(-3px) rotate(2deg); } }
      @keyframes popIn { 0% { opacity: 0; transform: scale(0.6); } 70% { transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); } }
      @keyframes slideUp { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes confettiFall { 0% { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(60vh) translateX(var(--drift,0)) rotate(720deg); opacity: 0; } }
      @keyframes gentlePulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      @keyframes soundWave { from { height: 4px; } to { height: 28px; } }
      @keyframes avatarPulse { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
      @keyframes ringPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
      @keyframes dotBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      @keyframes orbFloat { 0% { transform: translate(0, 0) scale(1); } 50% { transform: translate(10px, -15px) scale(1.1); } 100% { transform: translate(-5px, 10px) scale(0.95); } }
      @keyframes floatEmoji { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
      @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      button:active { transform: translateY(1px) scale(0.98) !important; }
    `}</style>
  );
}
