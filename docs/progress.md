# Festival Together Progress

Last updated: 2026-03-29 PT

## Completed

### Foundation
- [x] Product scope and decisions locked for v1
- [x] Repository and local foundation (docs, structure, CI skeleton, docker-compose)
- [x] Core backend flows (group/invite/founder/canonical gating/personal setup)
- [x] Schedule backend foundations (filters, individual schedules, stage-time payload, popularity tier)
- [x] Mobile integration foundation (tabbed setup + group + individual screens, API wiring)
- [x] Backend validation baseline with automated tests

### Mobile UX
- [x] Node/npm runtime repaired and Expo dev server running
- [x] Simulator-first mobile polish (one-tap full demo flow + setup/schedule edge-state UX)
- [x] Onboarding UX simplification and flow ordering (welcome → create/join → upload → review → confirm)
- [x] Group schedule timeline redesign (standardized time scale, proportional card heights, 6-stage full-day seed behavior)
- [x] Attendee clarity improvements (2-initial chips, card counts, tap-to-expand attendee details)
- [x] Member chip-color system (finite palette, unique per group, onboarding picker, API/storage integration)
- [x] Mobile offline persistence for sessions, snapshots, and queued preference sync replay
- [x] Privacy screen (consent gate before onboarding)

### Parser Pipeline
- [x] Canonical parser pipeline with OCR-like raw-text ingestion, overlap dedupe, confidence scoring, and artifact retention metadata
- [x] Personal schedule import mapped through canonical parsing instead of seeded direct inserts
- [x] Parser-worker utility commands for demo preview and expired artifact cleanup
- [x] **LLM-based schedule parsing** (Claude Haiku) — format-agnostic, handles list-view AND grid/column screenshots, generalizes across festivals and years
- [x] Google Cloud Vision API integration for OCR text extraction from screenshots
- [x] **Union upload approach** — any member's personal screenshot upload extends the group canonical schedule; no separate founder canonical upload step
- [x] Multi-upload merge (re-uploading accumulates, never deletes previous sets)

### Onboarding Redesign (LLM refactor)
- [x] `festival_setup` step: founder sets day labels (Friday/Saturday/Sunday or custom) before group is created
- [x] Festival days stored as JSON per group (`groups.festival_days`); used by LLM parser for day→index mapping
- [x] Unified `choose_library` step for both founders and members (same upload path)
- [x] `setup_complete = 1` now set when founder calls `POST /members/me/setup/complete` (replaces old canonical/confirm gate)
- [x] `SetupScreen.js` and `App.js` updated for new flow

### Release Infrastructure
- [x] Mobile build/release readiness baseline (Expo app identifiers, EAS profiles, release runbook)
- [x] Expo SDK 54 upgrade
- [x] EAS config: `ios.distribution: store`, `android.buildType: app-bundle`, production API URL set
- [x] **Render deployment** — API live at `https://festival-together-api.onrender.com`
- [x] Google Cloud Vision API key configured on Render and locally
- [x] `ANTHROPIC_API_KEY` added to `.env` template (value must be filled in locally and on Render)

## Validation
- [x] API automated tests passing (`12 passed`)
- [x] Parser-worker demo preview command verified
- [x] Python compile check completed for API app and tests
- [x] Expo config resolved successfully (`npm run config`)
- [x] Expo iOS export completed successfully (`npx expo export --platform ios`)
- [x] Render deploy live and healthy

## Pending Before Real-Device Testing
- [ ] Apple Developer enrollment approved (submitted ~3/24)
- [ ] EAS build: `eas build --platform ios --profile preview` (requires Apple Developer active)
- [ ] End-to-end test with real Coachella screenshots in iOS Simulator
- [ ] Deploy latest App.js + backend changes to Render (commit + push)

## Environment Files
- `services/api/.env` — `GOOGLE_VISION_API_KEY`, `ANTHROPIC_API_KEY`, `DATABASE_URL`, `SQLITE_PATH`
- `apps/mobile/.env` — `EXPO_PUBLIC_API_BASE_URL`
- `infra/.env` — infrastructure vars (not currently used for local dev)

(All `.env` files are hidden by default in Finder. Use Cmd+Shift+. to show hidden files, or open in VS Code.)

## Architecture Notes
- **Parser flow**: Screenshot → Google Cloud Vision (OCR) → Claude Haiku (LLM) → structured JSON → canonical_sets upsert + member_set_preferences upsert
- **Canonical sets**: Union of all member uploads. Each upload adds new artists; never deletes existing ones.
- **Festival days**: Configurable per group. Founder sets labels during onboarding; parser uses these to map day strings to day_index integers.
- **Offline**: Sessions, schedule snapshots, and pending preference updates persisted in AsyncStorage and replayed on reconnect.
- **Demo flow**: Uses legacy `canonical/import` endpoint to seed data for simulator testing; real users go straight to personal screenshot upload.
