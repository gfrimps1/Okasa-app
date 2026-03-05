/**
 * Ɔkasa API Client
 * Fetch-based wrapper with JWT auth token management.
 * No external dependencies — uses native fetch.
 */

const API_BASE = "/api/v1";

// ── Token management ──
let authToken = localStorage.getItem("okasa_token") || null;

export function getToken() {
  return authToken;
}

export function setToken(token) {
  authToken = token;
  if (token) {
    localStorage.setItem("okasa_token", token);
  } else {
    localStorage.removeItem("okasa_token");
  }
}

export function clearAuth() {
  setToken(null);
}

// ── Core fetch wrapper ──
async function apiFetch(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  // Remove Content-Type for FormData (multer needs multipart boundary)
  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 — token expired
  if (response.status === 401) {
    clearAuth();
    // Don't throw, let caller handle re-auth
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `API error: ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// ── Auth endpoints ──

export async function register(email, password) {
  const data = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function login(email, password) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function getMe() {
  return apiFetch("/auth/me");
}

// ── Profile endpoints ──

export async function getProfile() {
  return apiFetch("/profiles/me");
}

export async function updateProfile({ childName, parentName, language }) {
  return apiFetch("/profiles/me", {
    method: "PUT",
    body: JSON.stringify({
      child_name: childName,
      parent_name: parentName,
      language,
    }),
  });
}

// ── Lesson endpoints ──

export async function getLessons() {
  return apiFetch("/lessons");
}

export async function getLesson(slug) {
  return apiFetch(`/lessons/${slug}`);
}

// ── Progress endpoints ──

export async function getProgress() {
  return apiFetch("/progress");
}

export async function saveProgress(lessonSlug, score) {
  return apiFetch("/progress", {
    method: "POST",
    body: JSON.stringify({ lesson_slug: lessonSlug, score }),
  });
}

// ── Quiz endpoints ──

export async function submitQuiz(lessonSlug, answers) {
  return apiFetch("/quiz/submit", {
    method: "POST",
    body: JSON.stringify({ lesson_slug: lessonSlug, answers }),
  });
}

export async function getQuizHistory(lessonSlug) {
  return apiFetch(`/quiz/history/${lessonSlug}`);
}

// ── Avatar endpoints ──

export async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append("avatar", file);
  return apiFetch("/avatars/upload", {
    method: "POST",
    body: formData,
  });
}

// ── Health check ──
export async function healthCheck() {
  return apiFetch("/health");
}
