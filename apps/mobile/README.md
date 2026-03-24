# Mobile App

Expo React Native app for iOS/Android.

## Current App State
The app supports:
- Founder/member onboarding
- Group schedule and individual schedule views
- Persistent cached state across app restarts
- Offline read access to the latest cached data
- Queued personal preference changes that replay automatically once connectivity returns

## Run
1. `npm install`
2. `npm run start`
3. Ensure API is running at `http://127.0.0.1:8000` (or update API URL in the app)
4. Use a current Expo Go build that supports Expo SDK 54 when testing on a physical device
5. To reset the Metro cache, use `npm run start:clear`
6. To verify resolved Expo config, use `npm run config`

## API URL Notes
- iOS simulator usually works with `127.0.0.1`
- Android emulator commonly needs `10.0.2.2`
- Physical devices cannot use `127.0.0.1`; point the app at your machine's LAN IP instead

## Offline Sync Behavior
- The app persists the latest sessions, onboarding state, schedule snapshots, and personal schedule review data to `AsyncStorage`.
- When offline, cached group and individual schedule views remain available.
- Personal preference changes made offline are queued locally and replayed when the app reconnects.
- Founder canonical imports, onboarding creation/join, and personal re-import still require a live backend connection.

## Release Readiness
- Expo config now uses release identifiers:
  - iOS bundle ID: `com.festivaltogether.app`
  - Android package: `com.festivaltogether.app`
  - app scheme: `festivaltogether`
- EAS build profiles live in `eas.json`:
  - `development`
  - `preview`
  - `production`
- Preview build command:
  - `npm run release:preview`
- Production build command:
  - `npm run release:production`

## Release Checklist
1. Set `EXPO_PUBLIC_API_BASE_URL` to the deployed API origin.
2. Confirm App Store / Play Store credentials are available in Expo/EAS.
3. Replace placeholder branding assets if store submission requires them.
4. Run `npm run config` and a preview EAS build before production.
