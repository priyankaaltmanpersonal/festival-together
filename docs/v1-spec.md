# Coachella Group Planner - V1 Product + Technical Spec

## 1) Goal
Build an offline-first mobile app for friend groups attending Coachella to coordinate schedules from screenshot imports, visualize overlaps, and reduce regrouping friction when people split up.

V1 release target: private beta (TestFlight + Android internal/closed testing), not public app-store launch.

## 2) Product Scope
### In Scope (V1)
- One group per user.
- Invite-only groups (reusable invite link/code, no expiry).
- Founder-led group setup:
  - Founder uploads full festival schedule screenshots.
  - Canonical schedule parsing + confirmation required before invites can be sent.
  - Setup can complete with unresolved items flagged.
- Member onboarding:
  - Display name entry (auto initials avatar).
  - Batch upload personal screenshots.
  - Parse review with dedupe/merge for long-scroll overlap screenshots.
  - Preferences: `must-see` or `flexible` (`flexible` default).
  - Optional "Select all as must-see".
  - Optional photo avatar upload.
- Schedule views:
  - Primary group grid mirrors official Coachella layout:
    - columns = stages
    - rows = time
  - Individual schedules view for all members.
  - Default landing tab: Group Schedule.
- Visualization:
  - Avatar bubbles per set.
  - Count badge per set.
  - Popularity color intensity.
  - Avatar styles:
    - `must-see` = full opacity
    - `flexible` = faded
    - `not going` = hidden
- Filters:
  - Must-sees-only toggle (across anyone in group).
  - Person quick chips (multi-select, OR matching).
  - Reset filters button when active.
- Attendance override:
  - Per-user "not going" quick override.
  - Persistent until manually changed.
  - If toggled back to going, restore prior preference.
- Membership/status:
  - Joined-but-not-complete members shown with "setup incomplete".
  - Incomplete members excluded from grid counts/avatars.
  - Leave group requires confirmation.
  - Leaving removes member data from group views immediately.
  - Founder cannot leave group.
  - Founder can hard-delete group immediately (strong confirmation).
  - Founder can edit group name and group icon/photo.
- Canonical mapping rules:
  - Users can only edit their own attendance/preferences.
  - Parsed member entries auto-map to canonical sets.
  - Canonical set records are not user-editable in v1.
- Time display:
  - Use festival-local PT for schedule displays.
  - Show "PT" in context-specific detail views (not persistent top banner).
- Sync/offline:
  - App works offline with last synced data.
  - Long-lived session until explicit leave/reinstall.
  - No separate logout action.
- Import/parse pipeline:
  - Cloud parsing (not on-device) with cost controls.
  - Batch cap per user (initial target: 30 screenshots).
  - Auto image compression before upload.
  - Failed images can be retried individually.
  - Users can skip repeatedly failed images.
  - Member setup requires at least one successfully parsed set.
  - Uploaded originals retained temporarily up to 24 hours, then deleted.
- Notifications and communication:
  - In-app update indicators only.
  - No push notifications.
  - No in-app chat.
- Invite flow:
  - Deep links to open join screen in app.
  - If app not installed, show landing page with install links.
  - Show group name preview before join.
- Privacy/compliance basics:
  - Privacy & Data Use screen.
  - Simple Terms acknowledgment on create/join.
  - Analytics for product/reliability events only (no precise location/contacts).
  - Crash/error monitoring included.

### Out of Scope (V1)
- Public app store launch.
- Live location sharing.
- In-app chat/message board.
- Push notifications.
- Manual set-entry fallback flow.
- Recommendation card / ranked meetup options.
- Spotify integration.
- Multi-group per user.
- Shared-only (AND) people filter mode.
- Founder transfer.

## 3) User Roles and Permissions
### Founder
- Creates group.
- Must complete canonical schedule parse/confirm before invites.
- Can send invites.
- Can edit group name/icon.
- Can delete group.
- Cannot leave group in v1.

### Member
- Joins via invite link/code.
- Can edit only own attendance/preferences.
- Can upload/update own screenshots.
- Can leave group (with confirmation).

## 4) Core UX Flows
### A) Founder Setup Flow
1. Create group name.
2. Upload canonical schedule screenshots (batch).
3. Parsing + dedupe + merge.
4. Resolve/confirm parse where needed.
5. Allow unresolved placeholders.
6. Complete setup.
7. Invite links become active.

### B) Member Join + Onboarding Flow
1. Open invite deep link.
2. Preview group name.
3. Enter display name (initials avatar generated).
4. Upload personal screenshots (batch).
5. Parse review + preference editing (`flexible` default).
6. Optional "Select all as must-see".
7. Optional avatar photo upload.
8. Land on Group Schedule tab.

### C) Daily Use Flow
1. Open group schedule grid.
2. Scan avatars/count/color popularity.
3. Apply filters (must-sees, person chips, reset).
4. Toggle own sets to "not going" when plans change.
5. Switch to Individual Schedules when needed.

## 5) Data Model (V1)
High-level entities:
- `group`
  - id, name, icon_url, founder_member_id, invite_code, invite_status
- `member`
  - id, group_id, display_name, avatar_initials, avatar_photo_url, setup_status, joined_at
- `canonical_set`
  - id, group_id, artist_name, stage_name, start_time_pt, end_time_pt, day_index, status(`resolved|unresolved`)
- `member_set_preference`
  - id, member_id, canonical_set_id, preference(`must_see|flexible`), attendance(`going|not_going`), source_confidence
- `parse_job`
  - id, group_id or member_id, type(`canonical|personal`), status, created_at, completed_at, error_summary
- `parse_artifact`
  - id, parse_job_id, temp_image_path, retention_expires_at, deleted_at
- `analytics_event`
  - id, member_id nullable, group_id nullable, event_name, properties_json, created_at

Rules:
- One active group per member.
- `member_set_preference` exists only for mapped canonical sets.
- If attendance changes from `not_going` back to `going`, restore previous preference.

## 6) Architecture (V1)
### Client
- Expo + React Native (single iOS/Android codebase).
- Local SQLite cache for offline-first UX.
- Sync engine for pull/push when connectivity returns.

### Backend
- FastAPI service.
- Postgres database.
- Object storage for temporary image uploads only.
- Parse worker queue for OCR + extraction + mapping.

### Suggested Service Boundaries
- `api`:
  - auth-lite/session tokens
  - group/member management
  - schedule/read models
  - preference/attendance mutations
  - invite/deep-link handling
- `parser-worker`:
  - OCR + extraction
  - dedupe/merge across screenshot batches
  - map parsed sets to canonical records
  - mark unresolved items
- `sync`:
  - incremental updates per group
  - last-write-wins for user-owned fields
  - idempotent mutation endpoints

## 7) Offline and Sync Behavior
- Read path: always from local cache first.
- Write path: optimistic local update + queued sync mutation.
- Connectivity loss: queue pending mutations and show subtle sync state.
- Reconnect: replay queue in order.
- Conflict strategy:
  - User-owned fields only (attendance/preference), so conflicts are rare.
  - Last-write-wins per member field is acceptable.

## 8) Parsing Pipeline Requirements
1. Accept batch screenshots.
2. Auto-compress before upload.
3. Run OCR/extraction.
4. Detect overlaps/duplicates from long-scroll captures.
5. Normalize artist/stage/time tokens.
6. Canonical matching:
   - exact + fuzzy matching
   - unresolved fallback block creation
7. Save structured sets; delete originals within <=24h.
8. Expose confidence + parse issues for review UI.

## 9) Security and Privacy Baseline
- Invite-only access; non-discoverable groups.
- Reusable invite links; server-side rotate option (future optional).
- Data minimization:
  - no precise location
  - no contacts ingestion
- Privacy screen includes:
  - what is stored
  - retention/deletion behavior
  - member leave/delete behavior
- Terms acknowledgment on group create/join.

## 10) Analytics + Monitoring
Track minimum event set:
- onboarding_started
- onboarding_completed
- screenshot_upload_started/completed/failed
- parse_job_started/completed/failed
- parse_retry_clicked
- unresolved_items_count
- filter_used
- attendance_override_toggled
- group_joined
- group_left

Monitoring:
- Crash and API error reporting (Sentry or equivalent).
- Parse latency and failure-rate dashboards.

## 11) Cost Guardrails
- Cap batch size (initially 30 screenshots/user upload).
- Enforce image compression and max image dimensions.
- Delete originals after temporary retention window.
- Queue processing; avoid always-on high-cost workers.
- Keep private beta scale assumptions in deployment sizing.

## 12) Milestones and Acceptance Criteria
### M0 - Foundation
- Repo scaffolding (mobile, api, worker, infra, docs).
- Local dev runs end-to-end with mock data.
- Acceptance: one command path to run app + backend locally.

### M1 - Group + Invite Core
- Founder create/edit group.
- Invite links and join flow with group preview.
- One-group-per-user enforcement with "leave and join new group" path.
- Acceptance: 3 test users can join same group on local/dev backend.

### M2 - Canonical Setup
- Founder uploads canonical screenshots.
- Parse + dedupe + unresolved handling.
- Block invites until setup complete.
- Acceptance: canonical grid renders with resolved + unresolved blocks.

### M3 - Member Onboarding + Personal Parse
- Member batch upload and parse review.
- Auto-map to canonical sets.
- Preference editing and attendance override.
- Acceptance: member appears in group grid counts/avatars after completion.

### M4 - Schedule UX
- Group grid (stage columns/time rows).
- Individual schedules view.
- Avatars, counts, popularity colors, info legend.
- Filters (must-sees + people OR chips + reset).
- Acceptance: filters and visuals match specified behaviors on iOS + Android.

### M5 - Offline + Sync
- Local cache, queued mutations, reconnect replay.
- In-app update indicators.
- Acceptance: app usable in airplane mode with last synced data; sync restores when online.

### M6 - Beta Hardening
- Privacy screen, terms gate, analytics, crash monitoring.
- Parse error retries and skip flows.
- Performance pass and bug fixing.
- Acceptance: private beta ready with instrumentation and crash capture.

## 13) Deferred Backlog (V1.1 / V2)
- Meetup recommendation card (single best next meetup).
- Ranked top 3 meetup options.
- Spotify integration for preference prefill.
- Manual fallback add/search flow for sets.
- Shared-only people filter mode (AND).
- Founder transfer.
- Public app-store release readiness.

## 14) Open Execution Decisions (Engineering-level)
To finalize implementation tickets, choose concrete providers:
- Backend hosting (e.g., Render/Fly/Railway).
- Postgres provider.
- Object storage provider.
- OCR approach:
  - managed API vs self-hosted OCR.
- Auth-lite token/session strategy.

---
Owner intent: fast iterative build with agent-driven implementation, keeping v1 tight and festival-realistic.
