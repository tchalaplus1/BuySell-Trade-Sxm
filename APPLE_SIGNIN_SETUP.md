# Apple Sign-In Setup

Sign in with Apple is configured for the production Supabase project and enabled in the app config.

Current production setup:

```text
Apple Developer account/team: ASSOCIATION KOREK DIGITAL
Apple Team ID: CJ7X9S5JDT
Primary App ID: CJ7X9S5JDT.com.tchalaplus.mobile
Services ID / Client ID: com.korekdigitalmarketing.buyselltradesxm.web
Website domain: buyselltradesxm.com
Private relay domain source: buyselltradesxm.com
Private relay email source: noreply@buyselltradesxm.com
Supabase callback URL: https://szhaxlmronirhnntlwyb.supabase.co/auth/v1/callback
Supabase project ref: szhaxlmronirhnntlwyb
```

Do not store the Apple private key or generated OAuth secret in this repository.

## Rotation

Apple OAuth client secrets expire after 6 months. Before expiry, generate a new signed Apple client secret from the `.p8` key, then update:

```text
Supabase -> Authentication -> Providers -> Apple -> Secret Key
```

The Apple private key file was downloaded from Apple Developer when the key was created. Keep it in a secure backup location outside the repository.
