/**
 * Rate Limiter for OTP and Sensitive Auth Actions
 * Protects against brute-force attacks, continuous OTP requests, and DoS abuse.
 */

const OTP_COOLDOWN_SECONDS = 60; // Minimum time between consecutive OTP requests
const OTP_MAX_ATTEMPTS_PER_WINDOW = 3; // Max OTP requests allowed per email
const OTP_WINDOW_MS = 15 * 60 * 1000; // 15-minute rolling window
const OTP_VERIFY_MAX_FAILURES = 5; // Max incorrect OTP verification attempts before lockout

const STORAGE_KEY_OTP_REQUESTS = 'bookloop_otp_request_log';
const STORAGE_KEY_OTP_FAILURES = 'bookloop_otp_failures';

/**
 * Get the stored request log from localStorage
 */
function getRequestLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OTP_REQUESTS);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

/**
 * Save request log to localStorage
 */
function saveRequestLog(log) {
  try {
    localStorage.setItem(STORAGE_KEY_OTP_REQUESTS, JSON.stringify(log));
  } catch (e) {
    // Ignore storage quota issues
  }
}

/**
 * Check if an email is permitted to request an OTP
 * @param {string} email 
 * @returns {{ allowed: boolean, waitSeconds?: number, reason?: string }}
 */
export function checkOtpRateLimit(email) {
  if (!email || !email.trim()) {
    return { allowed: false, reason: 'Please enter a valid email address.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const now = Date.now();
  const log = getRequestLog();
  const entry = log[cleanEmail];

  if (!entry) {
    return { allowed: true };
  }

  // 1. Cooldown Check: Minimum 60s between requests
  const timeSinceLast = now - entry.lastRequest;
  if (timeSinceLast < OTP_COOLDOWN_SECONDS * 1000) {
    const waitSeconds = Math.ceil((OTP_COOLDOWN_SECONDS * 1000 - timeSinceLast) / 1000);
    return {
      allowed: false,
      waitSeconds,
      reason: `Please wait ${waitSeconds}s before requesting another OTP.`
    };
  }

  // 2. Rolling Window Check: Max 3 requests in 15 minutes
  const recentRequests = (entry.timestamps || []).filter(t => now - t < OTP_WINDOW_MS);
  if (recentRequests.length >= OTP_MAX_ATTEMPTS_PER_WINDOW) {
    const oldest = recentRequests[0];
    const waitSeconds = Math.ceil((OTP_WINDOW_MS - (now - oldest)) / 1000);
    const waitMinutes = Math.ceil(waitSeconds / 60);
    return {
      allowed: false,
      waitSeconds,
      reason: `Too many OTP requests for this account. For security, please wait ${waitMinutes} minute(s) before trying again.`
    };
  }

  return { allowed: true };
}

/**
 * Record a new OTP request attempt
 * @param {string} email 
 */
export function recordOtpRequest(email) {
  if (!email) return;
  const cleanEmail = email.trim().toLowerCase();
  const now = Date.now();
  const log = getRequestLog();
  const entry = log[cleanEmail] || { timestamps: [] };

  const recent = (entry.timestamps || []).filter(t => now - t < OTP_WINDOW_MS);
  recent.push(now);

  log[cleanEmail] = {
    lastRequest: now,
    timestamps: recent
  };

  saveRequestLog(log);
}

/**
 * Track failed OTP verification attempts to prevent brute-forcing
 */
export function recordOtpVerifyFailure(email) {
  if (!email) return;
  const cleanEmail = email.trim().toLowerCase();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OTP_FAILURES);
    const data = raw ? JSON.parse(raw) : {};
    const count = (data[cleanEmail] || 0) + 1;
    data[cleanEmail] = count;
    localStorage.setItem(STORAGE_KEY_OTP_FAILURES, JSON.stringify(data));
    return count;
  } catch (e) {
    return 1;
  }
}

/**
 * Check if verification attempts exceeded
 */
export function isOtpVerifyLocked(email) {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OTP_FAILURES);
    const data = raw ? JSON.parse(raw) : {};
    return (data[cleanEmail] || 0) >= OTP_VERIFY_MAX_FAILURES;
  } catch (e) {
    return false;
  }
}

/**
 * Reset verification failure counter upon successful login
 */
export function resetOtpVerifyFailures(email) {
  if (!email) return;
  const cleanEmail = email.trim().toLowerCase();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OTP_FAILURES);
    const data = raw ? JSON.parse(raw) : {};
    delete data[cleanEmail];
    localStorage.setItem(STORAGE_KEY_OTP_FAILURES, JSON.stringify(data));
  } catch (e) {}
}

