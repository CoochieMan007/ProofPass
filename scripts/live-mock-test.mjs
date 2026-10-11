// Exercises the Live Mode server path against a local mock of the Credence Cloud SDK.
import http from "node:http";
import { spawn } from "node:child_process";
import { decode } from "../lib/mdoc.mjs";

// Real two-document DeviceRequest (mDL + aamva.pdf417) returned by a Credence profile.
const TWO_DOC_REQUEST = "omd2ZXJzaW9uYzEuMGtkb2NSZXF1ZXN0c4KhbGl0ZW1zUmVxdWVzdNgYWFuiZ2RvY1R5cGV1b3JnLmlzby4xODAxMy41LjEubURMam5hbWVTcGFjZXOhcW9yZy5pc28uMTgwMTMuNS4xomhwb3J0cmFpdPRxaXNzdWluZ19hdXRob3JpdHn0oWxpdGVtc1JlcXVlc3TYGFhJomdkb2NUeXBlbGFhbXZhLnBkZjQxN2puYW1lU3BhY2VzoWxhYW12YS5wZGY0MTelY0RBQ_RjREFE9GNEQUr0Y0RCQvRjRENT9A";

const mockPort = 3299;
const appPort = 3298;
const seen = [];

const mock = http.createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  const body = text ? JSON.parse(text) : {};
  seen.push({ path: req.url, auth: req.headers.authorization, origin: req.headers.origin, body });
  const send = (value, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  if (req.url === "/v1/setup") return send({ accessToken: "AT", refreshToken: "RT", expiresIn: 900 });
  if (req.url === "/v1/getDocRequest") return send({ sessionId: "S1", dcRequest: { deviceRequest: TWO_DOC_REQUEST, encryptionInfo: "ENCINFO" } });
  if (req.url === "/v1/verifyDocRequest") return send({ res: true, resDetails: JSON.stringify({ given_name: "Jane", age_over_21: true }) });
  if (req.url === "/dcapi/openid4vp/v1/initiate") return send({ sessionId: "S2", payload: { response_type: "vp_token" } });
  if (req.url === "/dcapi/openid4vp/v1/validate") return send({ cancelled: true, message: "User declined" });
  return send({ error: "NOT_FOUND" }, 404);
});
await new Promise((resolve) => mock.listen(mockPort, "127.0.0.1", resolve));

const child = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    PORT: String(appPort),
    HOST: "",
    // Stray whitespace mimics values pasted into a hosting dashboard.
    CREDENCE_LICENSE_KEY: "CS_test\n",
    CREDENCE_PROFILE_ID: " profile-1 ",
    CREDENCE_ORIGIN: "https://proofpass.example/",
    CREDENCE_BASE_URL: `http://127.0.0.1:${mockPort}`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const post = async (path, body) => {
  const r = await fetch(`http://127.0.0.1:${appPort}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  return { status: r.status, json: await r.json() };
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

try {
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) {
    await delay(100);
    try { ready = (await fetch(`http://127.0.0.1:${appPort}/api/status`)).ok; } catch {}
  }
  assert(ready, "Server did not start.");

  const [apple, google] = await Promise.all([
    post("/api/session", JSON.stringify({ flow: "apple" })),
    post("/api/session", JSON.stringify({ flow: "google" })),
  ]);
  assert(apple.status === 200, `Apple session failed: ${JSON.stringify(apple.json)}`);
  assert(typeof apple.json.request?.deviceRequest === "string" && apple.json.request?.encryptionInfo === "ENCINFO", "Apple request must be { deviceRequest, encryptionInfo }.");
  const docRequests = decode(Buffer.from(apple.json.request.deviceRequest, "base64url")).value.find((e) => e.key === "docRequests").val.value;
  assert(docRequests.length === 1, "Apple request should keep only the mDL docRequest.");
  assert(google.json.request?.response_type === "vp_token", "Google request must pass the payload object through.");
  assert(seen.filter((r) => r.path === "/v1/setup").length === 1, "Concurrent sessions should share one token setup.");

  const setup = seen.find((r) => r.path === "/v1/setup");
  assert(setup.body.licenseKey === "CS_test" && setup.body.profileId === "profile-1", "Credentials should be trimmed.");
  assert(setup.origin === "https://proofpass.example", "Origin should be trimmed of a trailing slash.");

  const verified = await post("/api/verify", JSON.stringify({ flow: "apple", sessionId: "S1", data: { response: "WALLET" } }));
  assert(verified.json.verified === true, "Apple verification should succeed.");
  assert(seen.find((r) => r.path === "/v1/verifyDocRequest").body.data === "WALLET", "Wallet { response } should be unwrapped for verifyDocRequest.");
  assert(JSON.stringify(verified.json.claimKeys) === '["age_over_21","given_name"]', "Only claim names should be returned.");
  assert(!JSON.stringify(verified.json).includes("Jane"), "Claim values must not reach the browser.");

  const cancelled = await post("/api/verify", JSON.stringify({ flow: "google", sessionId: "S2", data: { response: "JWE" } }));
  assert(cancelled.json.cancelled === true && cancelled.json.verified === false, "Cancellation should be reported as cancelled.");

  const malformed = await post("/api/verify", "{not json");
  assert(malformed.status === 400, `Malformed JSON should return 400, got ${malformed.status}.`);

  console.log("✓ ProofPass live-mode mock test passed");
  console.log("  - Apple request shape matches the Digital Credentials API (mDL only)");
  console.log("  - wallet response unwrapped; only claim names returned");
  console.log("  - credentials trimmed; concurrent requests share one token");
  console.log("  - cancellation and malformed input handled");
} finally {
  child.kill("SIGTERM");
  mock.close();
}
