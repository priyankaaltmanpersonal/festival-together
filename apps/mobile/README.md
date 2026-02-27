# Mobile App

Expo React Native app for iOS/Android.

## Current Dev Harness (M3)
`App.js` now includes an interactive flow that calls backend endpoints in order:
1. Create founder group
2. Import + confirm canonical schedule
3. Create joiner and join invite
4. Import personal schedule
5. Mark must-sees
6. Complete setup
7. Load home snapshot
8. Load schedule snapshot with must-see + person filter controls

This is a temporary integration harness to accelerate API + flow validation before full UX screens.

## Run
1. `npm install`
2. `npm run start`
3. Ensure API is running at `http://127.0.0.1:8000` (or update API URL in the app)

## API URL Notes
- iOS simulator usually works with `127.0.0.1`
- Android emulator commonly needs `10.0.2.2`
