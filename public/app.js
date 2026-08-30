const timelineTemplate = [
  ["Verifier session", "Server activates the configured verifier", "SERVER"],
  ["Credential request", "Request is prepared from the verification profile", "SERVER"],
  ["Wallet engagement", "Browser hands the request to a compatible digital wallet", "BROWSER"],
  ["Holder consent", "User reviews the attributes before sharing", "WALLET"],
  ["Cryptographic verification", "Credential integrity, issuer trust, and policy are checked", "CREDENCE"],
  ["Application decision", "ProofPass receives the minimum verified result it needs", "APP"],
];

const scenarios = {
  success: ["Happy path", "Credential validates", "Identity verified", "Eligibility confirmed without storing an ID image."],
  cancelled: ["User cancels", "No consent", "Nothing was shared", "The user cancelled before consenting. They can safely try again."],
  expired: ["Session expires", "Fresh retry", "Session expired", "ProofPass discards the stale session and creates a fresh one on retry."],
  unsupported: ["Unsupported browser", "Capability fallback", "Wallet flow unavailable", "This browser does not expose the required credential capability. Offer a compatible device or QR flow."],
  network: ["Network timeout", "Fail safely", "Connection interrupted", "The request failed safely. No verification decision was recorded."],
  failed: ["Verification fails", "Neutral error", "Could not verify credential", "The application shows a neutral failure message and avoids leaking validation internals."],
};

const failAt = { unsupported: 2, cancelled: 3, expired: 1, network: 1, failed: 4 };
const state = { developer: false, failureLab: false, mode: "demo", flow: "apple", scenario: "success", liveConfigured: false, phase: "idle", result: null };
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function renderTimeline(statuses = []) {
  $("timeline").innerHTML = timelineTemplate.map(([title, detail, duration], i) => {
    const status = statuses[i] || "waiting";
    const mark = status === "success" ? "✓" : status === "error" ? "×" : String(i + 1);
    return `<div class="timeline-item ${status}"><div class="rail"><div class="dot">${mark}</div>${i < timelineTemplate.length - 1 ? '<div class="line"></div>' : ''}</div><div class="timeline-body"><div><b>${title}</b><span>${duration}</span></div><p>${detail}</p></div></div>`;
  }).join("");
}

function renderScenarios() {
  $("scenarioGrid").innerHTML = Object.entries(scenarios).map(([id, [label, hint]]) => `<button data-scenario="${id}" class="scenario ${state.scenario === id ? "selected" : ""}"><b>${label}</b><small>${hint}</small></button>`).join("");
  document.querySelectorAll("[data-scenario]").forEach((button) => button.addEventListener("click", () => {
    state.scenario = button.dataset.scenario;
    reset();
    renderScenarios();
  }));
}

function updateProtocol() {
  $("protocolValue").textContent = state.flow === "google" ? "openid4vp" : "org-iso-mdoc";
}

function reset() {
  state.phase = "idle";
  state.result = null;
  $("elapsed").textContent = "—";
  $("jsonBlock").classList.add("hidden");
  $("jsonBlock").textContent = "";
  renderTimeline();
  $("resultArea").innerHTML = '<button id="verifyButton" class="verify-button"><span>▣</span> Verify with Digital ID <span>→</span></button>';
  $("verifyButton").addEventListener("click", verify);
}

function showResult({ ok, title, message, result }) {
  const cls = ok ? "success-result" : "error-result";
  const icon = ok ? "✓" : "!";
  $("resultArea").innerHTML = `<div class="result-card ${cls}"><div class="result-icon">${icon}</div><div><span class="muted">${ok ? "VERIFICATION RESULT" : "SAFE FAILURE"}</span><h3>${title}</h3><p>${message}</p></div><button id="retryButton" class="link-button">Run again ↻</button></div>`;
  $("retryButton").addEventListener("click", reset);
  if (result) {
    $("jsonBlock").textContent = JSON.stringify({
      verified: result.verified,
      policy: result.policy,
      claimKeys: result.claimKeys || Object.keys(result.claims || {}),
      demoClaims: state.mode === "demo" ? result.claims : undefined,
      storage: result.storage,
    }, null, 2);
    $("jsonBlock").classList.remove("hidden");
  }
}

async function runDemo() {
  reset();
  const started = performance.now();
  const scenario = state.scenario;
  const statuses = Array(timelineTemplate.length).fill("waiting");

  for (let i = 0; i < timelineTemplate.length; i++) {
    statuses[i] = "active";
    renderTimeline(statuses);
    await sleep(i === 3 ? 650 : 360);

    if (scenario !== "success" && failAt[scenario] === i) {
      statuses[i] = "error";
      renderTimeline(statuses);
      $("elapsed").textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`;
      const [, , title, message] = scenarios[scenario];
      showResult({ ok: false, title, message });
      return;
    }
    statuses[i] = "success";
  }

  renderTimeline(statuses);
  $("elapsed").textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`;
  const result = {
    verified: true,
    policy: "DRIVER_ELIGIBILITY",
    provider: "Credence ID (simulated)",
    wallet: state.flow === "google" ? "Google Wallet" : "Apple Wallet",
    protocol: state.flow === "google" ? "OpenID4VP / ISO mdoc" : "org-iso-mdoc / ISO 18013",
    claims: { identity_valid: true, driving_privilege: true },
    storage: "No raw credential or ID image persisted",
  };
  showResult({ ok: true, title: "Identity verified", message: scenarios.success[3], result });
}

async function runLive() {
  reset();
  const started = performance.now();
  const statuses = Array(timelineTemplate.length).fill("waiting");
  try {
    statuses[0] = "active"; renderTimeline(statuses);
    const sessionResponse = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flow: state.flow }) });
    const session = await sessionResponse.json();
    if (!sessionResponse.ok) throw new Error(session.error || "Could not create Credence session.");
    statuses[0] = "success"; statuses[1] = "success"; statuses[2] = "active"; renderTimeline(statuses);

    if (!navigator.credentials || typeof navigator.credentials.get !== "function") throw new Error("This browser does not expose the Digital Credentials API.");
    const credential = await navigator.credentials.get({ digital: { requests: [{ protocol: session.protocol, data: session.request }] }, mediation: "required" });
    if (!credential || !credential.data) throw new Error("Wallet returned no credential data.");

    statuses[2] = "success"; statuses[3] = "success"; statuses[4] = "active"; renderTimeline(statuses);
    const verifyResponse = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flow: state.flow, sessionId: session.sessionId, data: credential.data }) });
    const verified = await verifyResponse.json();
    if (!verifyResponse.ok) throw new Error(verified.error || "Credence validation failed.");
    if (verified.cancelled) throw new Error(verified.message || "Verification was cancelled by the user.");
    if (!verified.verified) throw new Error("Credence did not validate this credential.");

    statuses[4] = "success"; statuses[5] = "success"; renderTimeline(statuses);
    $("elapsed").textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`;
    showResult({ ok: true, title: "Identity verified", message: "Live credential verification completed through Credence ID.", result: verified });
  } catch (error) {
    const active = statuses.indexOf("active");
    if (active >= 0) statuses[active] = "error";
    renderTimeline(statuses);
    $("elapsed").textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`;
    showResult({ ok: false, title: "Live verification could not complete", message: error instanceof Error ? error.message : "Unknown live verification error." });
  }
}

function verify() { return state.mode === "live" ? runLive() : runDemo(); }

$("developerToggle").addEventListener("click", () => {
  state.developer = !state.developer;
  $("developerPanel").classList.toggle("hidden", !state.developer);
  $("workspace").classList.toggle("dev-open", state.developer);
  $("developerToggle").classList.toggle("active", state.developer);
});

$("failureToggle").addEventListener("click", () => {
  state.failureLab = !state.failureLab;
  $("failurePanel").classList.toggle("hidden", !state.failureLab || state.mode !== "demo");
  $("failureToggle").classList.toggle("active", state.failureLab);
});

$("modeSelect").addEventListener("change", (event) => {
  state.mode = event.target.value;
  $("modeBadge").textContent = state.mode === "demo" ? "SIMULATED" : "LIVE";
  $("modeBadge").className = `mode-badge ${state.mode}`;
  $("failurePanel").classList.toggle("hidden", !state.failureLab || state.mode !== "demo");
  reset();
});

$("flowSelect").addEventListener("change", (event) => { state.flow = event.target.value; updateProtocol(); reset(); });

fetch("/api/status").then((r) => r.json()).then((data) => {
  state.liveConfigured = Boolean(data.liveConfigured);
  const option = $("liveOption");
  option.disabled = !state.liveConfigured;
  option.textContent = state.liveConfigured ? "Live Credence Mode — configured" : "Live Credence Mode — credentials required";
}).catch(() => {});

renderTimeline();
renderScenarios();
updateProtocol();
$("verifyButton").addEventListener("click", verify);
