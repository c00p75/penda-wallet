# Penda Mobile (iOS & Android)

Native Expo app for Penda. Same Supabase backend as the web app, with Reanimated
interactions and a floating Ask Penda chat orb.

## Stack

- **Expo SDK 57** + Expo Router + **expo-dev-client**
- **React Native Reanimated** + Gesture Handler
- **Supabase Auth** (magic link + Google OAuth via `penda://`)
- **expo-sms-listener** (Android ambient MoMo ingest; requires a native build)
- **expo-local-authentication** (app lock biometrics)
- **EAS Build / Submit** for App Store and Play Store

## Setup

```bash
# from repo root
cp apps/mobile/.env.example apps/mobile/.env
# fill EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY

npm install
npm run ios        # or: npm run android / npm run dev:mobile
```

In Supabase Auth URL Configuration, add:

- `penda://`
- The Expo redirect from `makeRedirectUri({ scheme: 'penda' })`

## Features

| Area | Status |
|------|--------|
| Auth, home, chat, ledger, budgets, goals, analytics | Core |
| Cashflow, journal, simulator | Settings → More |
| Business / family hubs | Settings → More |
| Challenges, missions, settle-up | Settings → More |
| Activity log, AI actions audit | Settings → More |
| App lock (PIN + biometrics) | Settings |
| Android SMS ambient ingest | Settings (dev/EAS build only) |
| MoMo clipboard paste + receipt camera | Ledger |

## Android SMS ingest

1. Build a **development** or **production** binary (SMS does not work in Expo Go).
2. Settings → enable **Auto-log MoMo SMS**.
3. Grant `READ_SMS` / `RECEIVE_SMS` when prompted.
4. Incoming MoMo/bank SMS matching the parser create ledger rows with `source: 'sms'`.
5. Honors profile `ai_consent.auto_log_sms` when set to `false`.

**Play Store note:** Google requires an SMS/Call Log permissions declaration. Use the
financial transaction autofill use-case and prepare a demo video for review.

## Store release (EAS)

You need Apple Developer + Google Play Console accounts (cannot be created from this repo).

```bash
cd apps/mobile
npx eas login
npx eas init                    # writes real projectId into app.json
# replace REPLACE_WITH_EAS_PROJECT_ID in app.json updates.url + extra.eas.projectId

# Dev client (SMS + native modules)
npm run build:dev

# Store binaries
npm run build:ios
npm run build:android

# After first successful builds:
npm run submit:ios              # needs App Store Connect app + ascAppId in eas.json
npm run submit:android          # needs google-play-service-account.json (gitignored)
```

### Checklist

- [ ] `eas init` and set `extra.eas.projectId`
- [ ] Apple: create App ID `com.penda.app`, App Store Connect app, fill `ascAppId`
- [ ] Google: create app `com.penda.app`, upload Play service account JSON
- [ ] Complete Play SMS permissions declaration form
- [ ] Privacy policy URL + store listing screenshots
- [ ] Supabase redirect URLs for production deep links

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Expo dev server |
| `npm run ios` / `android` | Simulator / emulator |
| `npm run typecheck` | TypeScript |
| `npm run build:dev` | EAS development client |
| `npm run build:ios` / `build:android` | Production store builds |
| `npm run submit:ios` / `submit:android` | Submit latest build |
