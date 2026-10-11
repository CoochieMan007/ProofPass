# Credence Sources Used

Checked against public Credence developer material on August 23, 2026, and re-checked against the live Cloud SDK and Credence's reference code on October 10, 2026.

1. Cloud SDK product overview  
   https://credenceid.com/digital-id/tap2id-cloud-sdk/

2. Detailed Cloud SDK API reference  
   https://credenceid.com/mobile-id/developer-documentation/sdk-reference/

3. Cloud SDK integration guide  
   https://credenceid.com/mobile-id/developer-documentation/integration-guide/

4. Cloud SDK / Verify with Credence onboarding  
   https://credenceid.com/resources/developer-documentation/tap2id/onboarding/

5. Credence React Cloud SDK reference integration  
   https://github.com/CredenceID/React-CloudSDK-Integration

6. Credence hosted Digital ID Playground (request captured for comparison)  
   https://credenceid.com/digitalid-playground/

7. Apple Platform Security — IDs in Apple Wallet (website requests, reader authentication)  
   https://support.apple.com/guide/security/ids-in-apple-wallet-secc50cff810/web

8. Apple WWDC25 — Verify identity documents on the web  
   https://developer.apple.com/videos/play/wwdc2025/232/

## Key facts used
- Cloud SDK is intended for website/backend wallet-ID verification.
- Setup uses a license key + Profile ID, with Origin matching the registered domain.
- Access tokens are short-lived and refresh tokens are used for renewal.
- Apple browser flow: `/v1/getDocRequest` → `navigator.credentials.get()` with `org-iso-mdoc` → `/v1/verifyDocRequest`.
- Apple browser flow passes `{ deviceRequest, encryptionInfo }` as `data` (reference repo), not the bare `deviceRequest` shown in the guide.
- Google browser flow: `/dcapi/openid4vp/v1/initiate` → `navigator.credentials.get()` with `openid4vp-v1-unsigned` → `/dcapi/openid4vp/v1/validate` with `credential.data.response`.
- Apple Wallet requires website requests to carry `readerAuth` signed with an Apple-issued certificate for the requesting domain.
- Additional QR/polling flows exist for Annex B and W3C wallet scenarios; those are described as extension work rather than falsely presented as implemented here.
