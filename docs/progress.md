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
- [x] Onboarding UX simplification and flow ordering
- [x] Group schedule timeline redesign (standardized time scale, proportional card heights, 6-stage full-day seed behavior)
- [x] Attendee clarity improvements (2-initial chips, card counts, tap-to-expand attendee details)
- [x] Member chip-color system (finite palette, unique per group, onboarding picker, API/storage integration)
- [x] Mobile offline persistence for sessions, snapshots, and queued preference sync replay
- [x] Privacy screen (consent gate before onboarding)
- [x] Back buttons on every onboarding step (welcome ← profile ← festival_setup ← upload_day)
- [x] End time display: only shown when it differs from start time
- [x] Finish button: correctly counts last day's successful upload
- [x] AppState resume check: if app is backgrounded during upload, resets to retry state on return

### Parser Pipeline (v2 — Claude Vision)
- [x] **Direct Claude vision parsing** — single API call replaces two-step Google Cloud Vision OCR + Claude text pipeline
- [x] Model: `claude-sonnet-4-6` — handles list-view AND full-grid column screenshots
- [x] Per-day upload flow: each festival day uploaded and reviewed independently
- [x] Dynamic festival days: founder sets day labels during onboarding (no hardcoded Fri/Sat/Sun)
- [x] Festival days stored as JSON per group; used by parser for day→index mapping
- [x] 12-hour time display with AM/PM (extended hours 24-29 = next-day early morning)
- [x] Multi-upload merge per day (re-uploading accumulates, never deletes previous sets)
- [x] Friendly error messages for parse failures

### Onboarding Flow (current)
- [x] `welcome` → `profile_create` (founder) or `profile_join` (member)
- [x] `festival_setup` (founder sets day labels)
- [x] `upload_day` — cycles through each day: choose screenshot → parse → review/set preferences → next day or finish
- [x] `setup_complete` set when member calls `POST /members/me/setup/complete`

### Release Infrastructure
- [x] Mobile build/release readiness baseline (Expo app identifiers, EAS profiles, release runbook)
- [x] Expo SDK 54 upgrade
- [x] EAS config: `ios.distribution: store`, `android.buildType: app-bundle`, production API URL set
- [x] **Render deployment** — API live at `https://festival-together-api.onrender.com`
- [x] `ANTHROPIC_API_KEY` configured on Render
- [x] AsyncStorage pinned to v2.2.0 (v3.x breaks Expo Go SDK 54)
- [x] Real-device testing via Expo Go confirmed working

## Open / Pending

### Must-Do Before Distribution
- [ ] **UX: add "Analyzing schedule, usually takes 5–10 seconds…" text** during upload spinner (currently just shows a spinner with no explanation)
- [ ] TestFlight build + distribute to group (Apple Developer enrollment submitted ~3/24, may now be approved)
- [ ] Remove `GOOGLE_VISION_API_KEY` from Render environment (no longer used — leftover from old pipeline)
- [ ] Revoke `GOOGLE_VISION_API_KEY` in Google Cloud Console

### Nice-to-Have / Speed Improvements
- [ ] **Try `claude-3-5-haiku-20241022` for parsing** — ~3-4x faster (~2-3s vs ~10s). Previously missed 1 of 6 artists; worth retrying with the improved prompt. If quality is acceptable, swap out sonnet.
- [ ] **Reduce `max_tokens` from 4096 to 1024** in `llm_parser.py` — minor speed improvement, low risk
- [ ] Tag `v0.2.0` on current main

### Post-Distribution / v1.1
- [ ] End-to-end test with real Coachella 2026 screenshots (multiple screenshot types)
- [ ] Apple Developer enrollment approved and TestFlight pipeline fully validated

## Environment Files
- `services/api/.env` — `ANTHROPIC_API_KEY`, `DATABASE_URL`, `SQLITE_PATH`
- `apps/mobile/.env` — `EXPO_PUBLIC_API_BASE_URL`
- `infra/.env` — infrastructure vars (not currently used for local dev)

(All `.env` files are hidden by default in Finder. Use Cmd+Shift+. to show hidden files, or open in VS Code.)

## Architecture Notes
- **Parser flow**: Screenshot → Claude Sonnet 4.6 vision → structured JSON → canonical_sets upsert + member_set_preferences upsert
- **Canonical sets**: Union of all member uploads. Each upload adds new artists; never deletes existing ones.
- **Festival days**: Configurable per group. Founder sets labels during onboarding; parser uses these to map day strings to day_index integers.
- **Offline**: Sessions, schedule snapshots, and pending preference updates persisted in AsyncStorage and replayed on reconnect.
- **Upload interruption**: AppState listener resets stuck `uploading` state to `error` when app returns to foreground.
- **No Google Cloud Vision**: Removed entirely as of v0.2.0. Single Claude vision call handles both OCR and parsing.
