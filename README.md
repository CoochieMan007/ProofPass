# ProofPass

Privacy-first digital ID verification for high-trust checkouts, built on the **Credence ID Cloud SDK**.

ProofPass asks a customer's mobile wallet (Apple Wallet, Google Wallet) for the evidence a transaction needs, has Credence verify it cryptographically, and keeps only the decision, not the customer's identity data. The sample transaction is a car rental pickup.

**Live:** https://proofpass-amey.onrender.com

- **Demo Mode** runs anywhere with no credentials. It is a deterministic simulation, clearly labelled `SIMULATED`.
- **Live Mode** calls the real Credence Cloud SDK. It unlocks automatically when Credence credentials are configured on the server.
- **Developer View** shows the verification timeline, the protocol in use, the result ProofPass keeps, and an **Apple request inspector** that decodes the wallet request Credence returned.

No npm dependencies: Node.js 20+ serves plain HTML, CSS and JavaScript.

Built with AI assistance (Claude Code).

## Run locally

```bash
npm start
```

Open http://localhost:3000. Demo Mode works immediately.

```bash
npm run check   # syntax-check every source file
npm test        # smoke test + Live Mode test against a mock Credence API
```

## Live Mode

Live Mode needs a **Cloud SDK** license from the [Verify with Credence portal](https://verify.credenceid.com/) (License Management → Generate License → Cloud SDK). The license is bound to the exact origin the app is served from.

| Variable | Value |
|---|---|
| `CREDENCE_LICENSE_KEY` | Cloud SDK license key (`CS_…`) |
| `CREDENCE_PROFILE_ID` | Profile ID attached to that license |
| `CREDENCE_ORIGIN` | The registered domain, e.g. `https://proofpass-amey.onrender.com` |
| `CREDENCE_BASE_URL` | Optional. Defaults to `https://credenceid.com/cloudsdk/playground` |
| `HOST` | Optional. Defaults to `127.0.0.1`; set `0.0.0.0` on a hosting platform |
| `PORT` | Optional. Defaults to `3000` |

Locally, copy `.env.example` to `.env.local` (git-ignored). On a host, set them as environment variables. Values are trimmed, so a pasted trailing newline doesn't break authentication.

### Deploying on Render

Web Service from this repo → Runtime **Node**, Build `npm install`, Start `node server.mjs`, set `HOST=0.0.0.0` plus the Credence variables. Generate the Cloud SDK license for the exact `https://<service>.onrender.com` origin. Free instances sleep when idle, so the first request can take about a minute.

## How Live Mode works

The browser never sees the license key or tokens. It talks only to the ProofPass server, which talks to Credence.

```text
Browser                     ProofPass server                    Credence Cloud SDK
───────                     ────────────────                    ──────────────────
pointerdown ── POST /api/session ──► token (cached, 60 s buffer) ─► /v1/setup or /v1/refresh
                                     Apple:  ─────────────────────► /v1/getDocRequest
                                     Google: ─────────────────────► /dcapi/openid4vp/v1/initiate
            ◄── { protocol, request, inspection }
click ── navigator.credentials.get({ digital: { requests: [{ protocol, data }] } })
            │  wallet shows the requested attributes; holder consents
            ▼
        POST /api/verify ──────────► Apple:  ─────────────────────► /v1/verifyDocRequest
                                     Google: ─────────────────────► /dcapi/openid4vp/v1/validate
            ◄── { verified, claimKeys }   (claim values discarded server-side)
```

| | Apple / ISO mdoc | Google / OpenID4VP |
|---|---|---|
| DC API protocol | `org-iso-mdoc` | `openid4vp-v1-unsigned` |
| `data` passed to the wallet | `{ deviceRequest, encryptionInfo }` | the `payload` object from `initiate` |
| Sent back to Credence | `credential.data` (JSON string if the browser returns an object) | `credential.data.response` (JWE) |

These shapes match Credence's [React reference integration](https://github.com/CredenceID/React-CloudSDK-Integration). The session request starts on `pointerdown` so that `navigator.credentials.get()` still runs inside the user's tap, which iOS Safari requires.

### Design choices

- **Secrets stay on the server.** License key, Profile ID, access and refresh tokens never reach client code. Every Credence call carries the registered `Origin`.
- **Token lifecycle.** The access token is cached with a 60-second expiry buffer and renewed via `/v1/refresh`, falling back to `/v1/setup`. Concurrent requests share one in-flight renewal so a rotating refresh token is never spent twice.
- **Data minimization.** The verification result is parsed server-side; the browser receives only the *names* of verified claims. Raw wallet responses are forwarded to Credence and never written to disk.
- **Failures are product states.** Wallet cancellation, no compatible wallet, unsupported browser, Credence errors and timeouts (15 s) each map to a neutral, user-safe message. Technical detail goes to the Developer View only, and all rendered text is escaped.
- **Protocol mechanics are isolated.** `public/app.js` owns the user journey. `lib/credence.mjs` owns Credence authentication, endpoints and response shaping. `lib/mdoc.mjs` decodes ISO 18013-5 requests for inspection only.

## Status and known limitation

Verified against the live Credence Cloud SDK (`playground`) on Oct 10, 2026:

| Step | Status |
|---|---|
| License activation, token issue and refresh | ✅ |
| Apple (`org-iso-mdoc`) and Google (`openid4vp-v1-unsigned`) wallet requests created | ✅ |
| Browser hands the request to the wallet (Chrome QR → iPhone) | ✅ |
| Apple Wallet offers the ID | ❌ "No eligible IDs available on your device" |
| Credence validates a wallet response | ⏳ not reached |

**Why Apple Wallet declines:** Apple Wallet only offers IDs to website requests signed (`readerAuth`) with an Apple-issued certificate for the requesting domain. The Developer View's request inspector shows the difference. Credence's hosted playground request is signed with an Apple-issued certificate for `credenceid.com` and is accepted on the same iPhone and California DL. The request Credence returns for this domain has no `readerAuth`. Signing for a customer domain has to be provisioned on the Credence/Apple side and has been raised with Credence.

The Google Wallet flow is implemented to the same reference shapes but has not yet been tested with an ID in Google Wallet.

## Code map

```text
server.mjs                       HTTP server: static files, /api/status, /api/session, /api/verify, security headers
lib/credence.mjs                 Server-only Credence adapter: config, tokens, endpoints, response shaping
lib/mdoc.mjs                     Read-only ISO 18013-5 DeviceRequest decoder for the request inspector
public/index.html                Product UI
public/app.js                    UI state machine, Demo Mode, Live Mode, error mapping, request inspector
public/styles.css                Styles
scripts/smoke-test.mjs           Starts the server without credentials; checks static app and safe 503
scripts/live-mock-test.mjs       Runs Live Mode against a mock Credence API
scripts/fixtures/                Captured Credence playground DeviceRequest (signed) used by the tests
ARCHITECTURE.md                  Trust boundaries and production deltas
CREDENCE_IMPROVEMENTS.md         Developer-experience findings from the integration
SOURCES.md                       Documentation and references used
```
