# Credence ID — Developer Experience Improvement Ideas

Observations from integrating ProofPass with the Cloud SDK (Oct 2026): concrete findings first, then broader ideas that would reduce time-to-first-success for the next developer.

## Findings from this integration

1. **Integration guide: `org-iso-mdoc` request shape.** The guide passes `data: dcRequest.deviceRequest` (a string). Chrome rejects it: *"Failed to read the 'data' property from 'DigitalCredentialGetRequest': Failed to convert value to 'object'"*. The working shape, used by the React reference repo, is the whole `dcRequest` object `{ deviceRequest, encryptionInfo }`. The guide also never mentions `encryptionInfo`.
2. **Integration guide: OpenID4VP protocol and response.** The guide uses `openid4vp` and doesn't specify the validate body. The reference repo uses `openid4vp-v1-unsigned` and sends `credential.data.response` (the JWE).
3. **Apple Wallet and reader authentication.** Requests for a customer's domain come back without `readerAuth`, so Apple Wallet reports "no eligible IDs" even when a valid ID is in Wallet. The hosted playground's request is signed with an Apple-issued certificate for `credenceid.com` and works on the same device. The docs don't say how customers get signing for their own domain, or that Apple requires it.
4. **Two environments, one documented.** The SDK reference lists only `/cloudsdk/playground` (labelled production). The React reference repo defaults to `/cloudsdkdev`, where a portal-issued key returns `INVALID_LICENSE_KEY`.
5. **Default profile vs privacy story.** The default "Age Check Profile" requests mDL and PDF417 with portrait and names, not an age attestation. Profiles can only be changed by Credence admins via support, which slows evaluation.
6. **iOS user-activation requirement.** The reference repo's pointerdown prefetch (so `navigator.credentials.get()` stays inside the tap on iOS Safari) is important and undocumented in the guide.
7. **Playground certificate expiry.** The playground's reader certificate (Apple Application Integration CA 7) is valid until Oct 13, 2026. A visible renewal/monitoring note would help.

## Broader ideas


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
