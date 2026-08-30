# ProofPass — Credence ID Cloud SDK Interview Demo

ProofPass is a privacy-first digital identity verification concept built for an SDK/platform interview. It deliberately demonstrates **two things at once**:

1. a polished end-user verification journey, and
2. a Developer View that explains the architecture, security boundary, state machine, and failure handling.

The project is intentionally **zero dependency**: Node.js serves plain HTML/CSS/JavaScript. That makes the interview demo much less likely to break because of package installation or framework version issues.

## Run it in under 30 seconds

### macOS
Double-click `start-demo.command`.

### Windows
Double-click `start-demo.bat`.

### Terminal
Requirements: **Node.js 20+**.

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

There are no npm dependencies to install.

## What works without any Credence account

**Demo Mode works immediately.** It is deterministic and clearly marked `SIMULATED`.

Use it to show:

- Happy-path verification
- Apple Wallet / `org-iso-mdoc` concept
- Google Wallet / `openid4vp` concept
- Developer View
- Failure Lab
  - user cancellation
  - expired session
  - unsupported browser
  - network timeout
  - failed verification
- Privacy/data-minimization design
- Server-side secret isolation

The simulator does **not** claim a real credential was cryptographically verified.

## Enable real Credence Live Mode

A live flow requires values issued/configured through Credence:

- Cloud SDK license key
- Profile ID
- Registered HTTPS origin/domain

Copy `.env.example` to `.env.local` and fill:

```env
CREDENCE_LICENSE_KEY=...
CREDENCE_PROFILE_ID=...
CREDENCE_ORIGIN=https://the-domain-registered-with-credence.example
CREDENCE_BASE_URL=https://credenceid.com/cloudsdk/playground
```

Restart the app. The Live Mode option unlocks automatically when those values exist.

Important: the registered origin is part of Credence's security model. A real demo may need to run on the HTTPS domain registered with the Cloud SDK key rather than localhost.

## Current live flow implemented

### Apple / DC API / ISO mdoc

```text
ProofPass server
   | POST /v1/setup
   v
Credence Cloud SDK
   | access token
   v
ProofPass server
   | POST /v1/getDocRequest
   v
Browser
   | navigator.credentials.get({ protocol: "org-iso-mdoc" })
   v
Apple Wallet / compatible wallet
   | holder consents
   v
Browser -> ProofPass server
   | credential.data
   v
Credence /v1/verifyDocRequest
   | verified result
   v
ProofPass decision
```

### Google / DC API / OpenID4VP

```text
ProofPass server
   | POST /dcapi/openid4vp/v1/initiate
   v
Browser
   | navigator.credentials.get({ protocol: "openid4vp" })
   v
Google Wallet / compatible wallet
   | credential.data
   v
ProofPass server
   | POST /dcapi/openid4vp/v1/validate
   v
Credence verification result
```

## Why this architecture is interview-worthy

### 1. Secrets stay behind a backend boundary
The browser never receives the Cloud SDK license key, Profile ID, access token, or refresh token.

### 2. Token lifecycle is handled
The adapter caches the access token, uses a 60-second expiry buffer, attempts `/v1/refresh`, and falls back to `/v1/setup` if necessary.

### 3. The app does not become an identity database
The live adapter parses the verified result server-side but deliberately returns only the **names of claims received**, not their personal values. The raw wallet response is not written to disk.

### 4. Failures are product states
Cancellation, expiry, unsupported browser, network failure, and verification failure are explicit demo scenarios instead of afterthoughts.

### 5. Protocol mechanics are isolated
`public/app.js` thinks about a verification journey. `lib/credence.mjs` owns Credence-specific authentication, endpoints, and response normalization.

## Code map

```text
proofpass-credence-demo/
├── public/
│   ├── index.html        # product UI structure
│   ├── styles.css        # polished responsive design
│   └── app.js            # UI state machine, Demo Mode, Live browser wallet call
├── lib/
│   └── credence.mjs      # server-only Credence adapter + token management
├── scripts/
│   └── smoke-test.mjs    # automatic sanity test
├── server.mjs            # tiny backend + API boundary + static server
├── .env.example          # optional Live Mode configuration
├── ARCHITECTURE.md       # trust boundaries, production deltas
├── SOURCES.md            # Credence docs referenced
└── CREDENCE_IMPROVEMENTS.md  # developer-experience feedback for Credence
```

## Test before the interview

```bash
npm run check
npm test
```

Expected:

```text
✓ ProofPass smoke test passed
```

## What to say about Demo Mode

> “The state machine is running in deterministic Demo Mode so I can reliably demonstrate success and failure paths. It is explicitly labeled simulated. A separate Live Mode implements the documented Credence browser flow and unlocks only when valid Credence credentials are configured.”

## Credence references used

- https://credenceid.com/digital-id/tap2id-cloud-sdk/
- https://credenceid.com/mobile-id/developer-documentation/sdk-reference/
- https://credenceid.com/mobile-id/developer-documentation/integration-guide/
- https://credenceid.com/resources/developer-documentation/tap2id/onboarding/

The current detailed SDK reference describes `https://credenceid.com/cloudsdk/playground` as the Cloud SDK base URL. Always re-check the assigned environment and portal values before a real live demo.
