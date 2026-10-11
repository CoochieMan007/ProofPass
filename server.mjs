import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createSession, isLiveConfigured, verifySession } from "./lib/credence.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = resolve(ROOT, "public");

loadDotEnv(join(ROOT, ".env.local"));
loadDotEnv(join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 3000);
// Local default stays loopback-only; hosting platforms set HOST=0.0.0.0.
const HOST = process.env.HOST || "127.0.0.1";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function securityHeaders() {
  return {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  };
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    ...securityHeaders(),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new RequestError(413, "Request body too large.");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new RequestError(400, "Request body must be valid JSON.");
  }
}

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const errorStatus = (error) => (error instanceof RequestError ? error.status : 500);

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/status") {
    return sendJson(res, 200, { liveConfigured: isLiveConfigured() });
  }

  if (req.method === "POST" && url.pathname === "/api/session") {
    try {
      if (!isLiveConfigured()) return sendJson(res, 503, { error: "Live Mode is not configured." });
      const body = await readJson(req);
      const flow = body.flow === "google" ? "google" : "apple";
      return sendJson(res, 200, await createSession(flow));
    } catch (error) {
      return sendJson(res, errorStatus(error), { error: error instanceof Error ? error.message : "Could not create session." });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/verify") {
    try {
      if (!isLiveConfigured()) return sendJson(res, 503, { error: "Live Mode is not configured." });
      const body = await readJson(req);
      if (!body.sessionId || !body.data) return sendJson(res, 400, { error: "Missing wallet response." });
      const flow = body.flow === "google" ? "google" : "apple";
      return sendJson(res, 200, await verifySession({ flow, sessionId: body.sessionId, data: body.data }));
    } catch (error) {
      return sendJson(res, errorStatus(error), { error: error instanceof Error ? error.message : "Could not verify credential." });
    }
  }

  return false;
}

async function serveStatic(res, pathname) {
  let requested;
  try {
    requested = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    return false;
  }

  const relative = requested.replace(/^\/+/, "");
  const filePath = resolve(PUBLIC, relative);
  if (filePath !== PUBLIC && !filePath.startsWith(`${PUBLIC}${sep}`)) return false;

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    const body = await readFile(filePath);
    res.writeHead(200, {
      ...securityHeaders(),
      "Cache-Control": "no-cache",
      "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
      "Content-Length": body.length,
    });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    const handled = await handleApi(req, res, url);
    if (handled !== false) return;
    return sendJson(res, 404, { error: "Not found" });
  }
  if (await serveStatic(res, url.pathname)) return;
  res.writeHead(404, { ...securityHeaders(), "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`\nProofPass is running: http://localhost:${PORT}`);
  console.log(`Mode: ${isLiveConfigured() ? "Demo + Live Credence" : "Demo (no Credence credentials required)"}`);
  console.log("Press Ctrl+C to stop.\n");
});
