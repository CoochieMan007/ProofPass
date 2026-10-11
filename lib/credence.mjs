/**
 * Credence Cloud SDK adapter.
 *
 * Product boundary:
 * - License key, profile ID, access token and refresh token stay server-side.
 * - The browser receives only the wallet request needed by navigator.credentials.get().
 * - The raw wallet response is forwarded to Credence for validation and is never written to disk.
 * - Verified claim VALUES are deliberately discarded by this demo; the UI sees only claim names.
 *
 * Current reference flow:
 *   POST /v1/setup
 *   Apple:  POST /v1/getDocRequest -> wallet -> POST /v1/verifyDocRequest
 *   Google: POST /dcapi/openid4vp/v1/initiate -> wallet -> POST /dcapi/openid4vp/v1/validate
 */

let tokenCache = null;
let tokenRequest = null;
const REQUEST_TIMEOUT_MS = 15_000;

// Trim so values pasted into a hosting dashboard with a stray newline still work.
const env = (name) => (process.env[name] || "").trim();

function config() {
  return {
    baseUrl: (env("CREDENCE_BASE_URL") || "https://credenceid.com/cloudsdk/playground").replace(/\/$/, ""),
    licenseKey: env("CREDENCE_LICENSE_KEY"),
    profileId: env("CREDENCE_PROFILE_ID"),
    origin: env("CREDENCE_ORIGIN").replace(/\/$/, ""),
  };
}

async function credenceFetch(url, options, label) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    if (error?.name === "TimeoutError") throw new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`);
    throw new Error(`${label} could not reach Credence.`);
  }
}

export function isLiveConfigured() {
  const c = config();
  return Boolean(c.licenseKey && c.profileId && c.origin);
}

async function parseResponse(response, label) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const code = body?.error || body?.code;
    const message = body?.message || body?.raw || response.statusText;
    const compact = [code, message].filter(Boolean).join(": ");
    throw new Error(`${label} failed (${response.status}): ${compact || "Unknown error"}`.slice(0, 320));
  }
  return body;
}

async function setupTokens() {
  const c = config();
  const response = await credenceFetch(`${c.baseUrl}/v1/setup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: c.origin,
    },
    body: JSON.stringify({ licenseKey: c.licenseKey, profileId: c.profileId }),
  }, "Credence setup");

  const body = await parseResponse(response, "Credence setup");
  const now = Date.now();
  tokenCache = {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    expiresAt: now + Number(body.expiresIn || 900) * 1000,
    // Docs currently describe the refresh token as valid for seven days.
    refreshExpiresAt: now + 7 * 24 * 60 * 60 * 1000,
  };
  return tokenCache.accessToken;
}

async function refreshTokens() {
  const c = config();
  if (!tokenCache?.refreshToken) return setupTokens();

  const response = await credenceFetch(`${c.baseUrl}/v1/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: c.origin },
    body: JSON.stringify({ refreshToken: tokenCache.refreshToken }),
  }, "Credence token refresh");

  const body = await parseResponse(response, "Credence token refresh");
  const now = Date.now();
  tokenCache = {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken || tokenCache.refreshToken,
    expiresAt: now + Number(body.expiresIn || 900) * 1000,
    refreshExpiresAt: now + 7 * 24 * 60 * 60 * 1000,
  };
  return tokenCache.accessToken;
}

async function getAccessToken() {
  if (!isLiveConfigured()) throw new Error("Credence Live Mode is not configured.");

  const now = Date.now();
  // Keep a 60-second safety buffer, matching the integration guidance.
  if (tokenCache?.accessToken && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  // Share one in-flight renewal so concurrent requests don't spend a rotating refresh token twice.
  tokenRequest ??= renewTokens().finally(() => { tokenRequest = null; });
  return tokenRequest;
}

async function renewTokens() {
  if (tokenCache?.refreshToken && tokenCache.refreshExpiresAt > Date.now() + 60_000) {
    try {
      return await refreshTokens();
    } catch {
      // A refresh token is one-time/rotating. If refresh fails, re-activate cleanly.
      tokenCache = null;
    }
  }

  return setupTokens();
}

async function api(path, { method = "POST", body } = {}) {
  const c = config();
  const accessToken = await getAccessToken();
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await credenceFetch(`${c.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }, `Credence ${path}`);
  return parseResponse(response, `Credence ${path}`);
}

export async function createSession(flow) {
  if (flow === "google") {
    const data = await api("/dcapi/openid4vp/v1/initiate");
    return {
      sessionId: data.sessionId,
      flow: "google",
      protocol: "openid4vp",
      request: data.payload,
    };
  }

  const data = await api("/v1/getDocRequest");
  const { deviceRequest, encryptionInfo } = data.dcRequest || {};
  if (!deviceRequest || !encryptionInfo) throw new Error("Credence /v1/getDocRequest returned an incomplete dcRequest.");
  return {
    sessionId: data.sessionId,
    flow: "apple",
    protocol: "org-iso-mdoc",
    // The Digital Credentials API requires an object for org-iso-mdoc, not the bare
    // deviceRequest string shown in Credence's integration guide.
    request: { deviceRequest, encryptionInfo },
  };
}

function parseClaims(raw) {
  if (typeof raw?.resDetails === "string") {
    try {
      const parsed = JSON.parse(raw.resDetails);
      // Some OpenID4VP responses nest identity under `identity`.
      return parsed?.identity && typeof parsed.identity === "object" ? parsed.identity : parsed;
    } catch {
      return {};
    }
  }
  if (raw?.claims && typeof raw.claims === "object") return raw.claims;
  return {};
}

export async function verifySession({ flow, sessionId, data }) {
  const path = flow === "google"
    ? "/dcapi/openid4vp/v1/validate"
    : "/v1/verifyDocRequest";

  // Browsers return org-iso-mdoc credentials as { response: "<base64url>" };
  // /v1/verifyDocRequest expects just that string.
  const payload = flow !== "google" && typeof data?.response === "string" ? data.response : data;
  const raw = await api(path, { body: { sessionId, data: payload } });

  if (raw?.cancelled) {
    return {
      verified: false,
      cancelled: true,
      message: raw.message || "Verification was cancelled by the user.",
      provider: "Credence ID",
      wallet: flow === "google" ? "Google Wallet" : "Apple Wallet",
      protocol: flow === "google" ? "OpenID4VP / ISO mdoc" : "org-iso-mdoc / ISO 18013",
      claimKeys: [],
      storage: "No raw wallet credential or verified claim values persisted by ProofPass",
    };
  }

  const verified = Boolean(raw?.res ?? raw?.success);
  const claims = parseClaims(raw);

  // Important privacy choice for this interview app: prove that verification happened
  // without reflecting actual identity values into the browser/developer console.
  const claimKeys = claims && typeof claims === "object" ? Object.keys(claims).sort() : [];

  return {
    verified,
    cancelled: false,
    policy: "CREDENCE_PROFILE_POLICY",
    provider: "Credence ID",
    wallet: flow === "google" ? "Google Wallet" : "Apple Wallet",
    protocol: flow === "google" ? "OpenID4VP / ISO mdoc" : "org-iso-mdoc / ISO 18013",
    claimKeys,
    storage: "Raw wallet response forwarded for verification, then discarded; claim values not returned to the browser",
  };
}
