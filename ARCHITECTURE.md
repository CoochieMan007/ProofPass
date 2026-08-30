# ProofPass Architecture

```text
┌─────────────────────────────────────────────────────────┐
│ USER'S BROWSER                                          │
│                                                         │
│  ProofPass UI                                           │
│  - user journey                                         │
│  - Developer View                                       │
│  - Failure Lab (Demo Mode only)                         │
│                                                         │
│  navigator.credentials.get(...)                         │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS to our API
                        ▼
┌─────────────────────────────────────────────────────────┐
│ PROOFPASS SERVER                                        │
│                                                         │
│  server.mjs                                             │
│  - /api/status                                          │
│  - /api/session                                         │
│  - /api/verify                                          │
│                                                         │
│  lib/credence.mjs                                       │
│  - license/profile stay here                            │
│  - access/refresh token management                      │
│  - flow-specific endpoints                              │
│  - result normalization                                 │
│  - claim VALUES discarded before browser response      │
└───────────────────────┬─────────────────────────────────┘
                        │ Bearer-authenticated requests
                        ▼
┌─────────────────────────────────────────────────────────┐
│ CREDENCE CLOUD SDK                                      │
│                                                         │
│  /v1/setup / /v1/refresh                                │
│  Apple: getDocRequest / verifyDocRequest                │
│  Google: openid4vp initiate / validate                  │
└───────────────────────┬─────────────────────────────────┘
                        │ prepares / validates credential
                        ▼
┌─────────────────────────────────────────────────────────┐
│ DIGITAL WALLET                                          │
│                                                         │
│ Apple Wallet / Google Wallet / compatible implementation│
│ - presents requested data to holder                     │
│ - obtains consent                                       │
│ - returns credential presentation                       │
└─────────────────────────────────────────────────────────┘
```

## Trust boundaries

### Browser is not trusted with long-lived secrets
No Credence license key or bearer token is sent to client-side code.

### Raw wallet data is transient
The browser sends the wallet response to the ProofPass server; it is forwarded to Credence for validation. This sample does not write it to disk.

### Verified personal values are minimized
The server parses the Credence result but the interview UI receives only claim names plus success/failure. A real product would define retention requirements with security/legal stakeholders.

## What would change in production
- shared token cache instead of process memory if horizontally scaled
- secret manager instead of `.env.local`
- structured privacy-safe logs and correlation IDs
- rate limiting on ProofPass endpoints
- CSRF/origin protections appropriate to deployment
- accessibility and cross-browser testing
- metrics/SLOs
- formal retention/deletion policy
- automated integration tests against Credence-provided sandbox/test tooling
