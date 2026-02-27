# Mobile App

Expo React Native app for iOS/Android.

## Current Dev Harness (M3/M4 Foundation)
The app now has three tabs:
- Setup
- Group Schedule
- Individual Schedules

The setup flow calls backend endpoints in order:
1. Create founder group
2. Import + confirm canonical schedule
3. Create joiner and join invite
4. Import personal schedule
5. Mark must-sees
6. Complete setup
7. Load home snapshot
8. Load schedule snapshot with must-see + person filter controls
9. Load individual schedules snapshot

This remains a development harness, but it now reflects the target app sections instead of a single placeholder page.

## Run
1. `npm install`
2. `npm run start`
3. Ensure API is running at `http://127.0.0.1:8000` (or update API URL in the app)

## API URL Notes
- iOS simulator usually works with `127.0.0.1`
- Android emulator commonly needs `10.0.2.2`
