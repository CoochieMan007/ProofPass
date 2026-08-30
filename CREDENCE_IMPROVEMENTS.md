# Credence ID — Developer Experience Improvement Ideas

Observations from a friction log kept while integrating — opportunities that would reduce time-to-first-success for the next developer.

1. **Runnable starter kit:** a tiny starter repo or CLI that launches in mock/sandbox mode before a developer has production credentials.
2. **First-class test wallet / simulator:** deterministic valid, cancelled, expired, untrusted issuer and malformed-response scenarios.
3. **Capability API:** a helper that tells developers what flows the current browser/device can support and the best fallback.
4. **Single high-level JS/TS client:** keep REST endpoints available, but offer a typed orchestration layer for setup, refresh, initiate, validate and retry.
5. **Local-development story:** make the registered-origin requirement easy to understand with explicit localhost/tunnel guidance and a dev-origin workflow.
6. **Compatibility matrix:** Wallet × OS × browser × minimum version × same-device × cross-device × protocol.
7. **Error contract:** stable error code, developer message, user-safe message, retryable flag, request/correlation ID, and direct docs link.
8. **Observability:** a privacy-safe transaction timeline in the portal showing setup, request, wallet engagement and validation without displaying raw credential data.
9. **Interactive claim/profile builder:** choose “age over 21,” “name,” “driving privilege,” etc., see what data will be requested, and export the matching configuration.
10. **Terminology consistency:** make “Online Verifier,” “Cloud SDK,” and “Tap2iD Cloud SDK” naming unambiguous across assignment, marketing, portal and docs.
11. **Framework recipes:** short, tested examples for vanilla JS, Next.js/React, Express, Python/FastAPI and common deployment targets.
12. **Copy-paste production checklist:** secrets, token refresh, origin validation, CSP, logging/PII, retries, timeout, accessibility, and fallback flow guidance.
