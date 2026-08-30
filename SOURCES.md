# Credence Sources Used

Checked against current public Credence developer material on August 23, 2026.

1. Cloud SDK product overview  
   https://credenceid.com/digital-id/tap2id-cloud-sdk/

2. Detailed Cloud SDK API reference  
   https://credenceid.com/mobile-id/developer-documentation/sdk-reference/

3. Cloud SDK integration guide  
   https://credenceid.com/mobile-id/developer-documentation/integration-guide/

4. Cloud SDK / Verify with Credence onboarding  
   https://credenceid.com/resources/developer-documentation/tap2id/onboarding/

## Key facts used
- Cloud SDK is intended for website/backend wallet-ID verification.
- Setup uses a license key + Profile ID, with Origin matching the registered domain.
- Access tokens are short-lived and refresh tokens are used for renewal.
- Apple browser flow: `/v1/getDocRequest` → `navigator.credentials.get()` with `org-iso-mdoc` → `/v1/verifyDocRequest`.
- Google browser flow: `/dcapi/openid4vp/v1/initiate` → `navigator.credentials.get()` with `openid4vp` → `/dcapi/openid4vp/v1/validate`.
- Additional QR/polling flows exist for Annex B and W3C wallet scenarios; those are described as extension work rather than falsely presented as implemented here.
