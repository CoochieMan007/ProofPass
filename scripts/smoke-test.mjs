import { spawn } from "node:child_process";

const port = 3199;
const child = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, PORT: String(port), CREDENCE_LICENSE_KEY: "", CREDENCE_PROFILE_ID: "", CREDENCE_ORIGIN: "" },
  stdio: ["ignore", "pipe", "pipe"],
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await delay(100);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/status`);
      if (r.ok) { ready = true; break; }
    } catch {}
  }
  if (!ready) throw new Error("Server did not start.");

  const home = await fetch(`http://127.0.0.1:${port}/`);
  if (!home.ok || !(await home.text()).includes("ProofPass")) throw new Error("Home page smoke test failed.");

  const status = await fetch(`http://127.0.0.1:${port}/api/status`).then((r) => r.json());
  if (status.liveConfigured !== false) throw new Error("Demo-mode status should be false without credentials.");

  const session = await fetch(`http://127.0.0.1:${port}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flow: "apple" }),
  });
  if (session.status !== 503) throw new Error("Live session endpoint should fail safely when not configured.");

  console.log("✓ ProofPass smoke test passed");
  console.log("  - static app served");
  console.log("  - demo mode reports correctly");
  console.log("  - live endpoint fails safely without credentials");
} finally {
  child.kill("SIGTERM");
}
