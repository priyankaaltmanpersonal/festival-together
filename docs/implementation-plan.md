# Coachella Group Planner - Implementation Plan

## 1) Delivery Strategy
Build in thin vertical slices so each milestone is demoable on device and keeps cost low. Do not purchase paid services until private beta readiness.

Execution order:
1. M0 foundation
2. M1 group + invite core
3. M2 canonical setup flow
4. M3 member onboarding + personal parse
5. M4 schedule UX + filters
6. M5 offline + sync hardening
7. M6 beta hardening + testflight/internal release prep

## 2) Ticket Backlog (M0-M2 detailed)
### M0 - Foundation
#### M0.1 Repo scaffolding
- Create monorepo layout:
  - `apps/mobile`
  - `services/api`
  - `services/parser-worker`
  - `packages/shared-types`
  - `infra`
  - `docs`
- Add root README with runbook.
- Acceptance:
  - All folders present.
  - New dev can understand structure from README.

#### M0.2 Local dev environment
- Add local compose services:
  - Postgres
  - Redis (queue)
  - MinIO or local storage stub
- Add `.env.example` files for each service.
- Acceptance:
  - Dependencies can start locally via one command.

#### M0.3 API skeleton
- FastAPI app with:
  - health endpoint
  - versioned route prefix `/v1`
  - request logging
  - structured error envelope
- Acceptance:
  - `GET /health` returns 200 and build info.

#### M0.4 Mobile shell
- Expo app shell with:
  - navigation stack
  - screens: Welcome, Join, GroupSchedule, IndividualSchedules
  - API client abstraction
- Acceptance:
  - App starts in simulator and navigates between placeholder screens.

#### M0.5 Shared contracts
- Define shared API/data contracts (OpenAPI as source of truth).
- Generate/maintain typed client contracts for mobile.
- Acceptance:
  - No ad hoc JSON contracts between client and API.

#### M0.6 CI baseline
- Add lint/type/test scripts.
- Add simple CI workflow for API + mobile static checks.
- Acceptance:
  - CI passes on clean branch.

### M1 - Group + Invite Core
#### M1.1 Data model migration v1
- Tables:
  - groups
  - members
  - invites
  - sessions
- Constraints:
  - one active group per member profile
  - founder role uniqueness in group
- Acceptance:
  - Migration applies cleanly to empty DB.

#### M1.2 Auth-lite sessions
- Session token issuance and validation.
- Device-bound long-lived session model.
- Acceptance:
  - Reopen app retains session unless leave/reinstall.

#### M1.3 Group create/edit APIs
- Founder can create group.
- Founder can edit group name/icon.
- Acceptance:
  - Non-founder edits rejected with clear error code.

#### M1.4 Invite link lifecycle
- Generate reusable invite code/link.
- Join preview endpoint returns group name/icon.
- Join endpoint enforces one-group-per-user.
- Acceptance:
  - Link opens join preview and can onboard a new member.

#### M1.5 Leave / delete behavior
- Member leave requires confirmation flag.
- Founder cannot leave.
- Founder can hard-delete group.
- Acceptance:
  - Group hard delete removes group and dependent records.

#### M1.6 Mobile flow wiring
- Implement create/join/leave paths in app UI.
- Add "leave current group and join new one" path.
- Acceptance:
  - Full happy path demo from fresh install to joined group.

### M2 - Canonical Setup
#### M2.1 Canonical schedule entities
- Add `canonical_sets` and `canonical_parse_jobs`.
- Add unresolved status support.
- Acceptance:
  - Canonical set CRUD endpoints pass integration tests.

#### M2.2 Founder upload flow
- Batch upload endpoint with max-count validation.
- Upload pre-processing metadata capture.
- Acceptance:
  - >max images rejected with actionable message.

#### M2.3 Parser worker pipeline v1
- Job queue consumer:
  - OCR extraction (stub/provider adapter)
  - dedupe/merge pass
  - normalization
  - unresolved classification
- Acceptance:
  - Sample batch produces canonical set rows.

#### M2.4 Founder review + confirm
- API and UI for parse review.
- Founder can confirm with unresolved items.
- Invites blocked until confirmed.
- Acceptance:
  - Join endpoint returns "setup_pending" until confirmed.

#### M2.5 Temporary artifact retention
- Store originals with 24h expiry metadata.
- Cleanup job deletes expired objects.
- Acceptance:
  - Expired test artifacts are removed by cleanup run.

## 3) Milestone Exit Criteria (M3-M6)
### M3 - Member Onboarding + Personal Parse
- Personal screenshot upload and parse review shipped.
- Canonical mapping + preferences persisted.
- Setup requires >=1 parsed set.

### M4 - Schedule UX
- Group stage/time grid complete.
- Avatars/count/popularity visuals complete.
- Individual schedules complete.
- Filters complete (must-see + people OR + reset).

### M5 - Offline + Sync
- SQLite local cache and mutation queue.
- Offline mode validated in flight mode tests.
- Reconnect sync replay and update indicators complete.

### M6 - Beta Hardening
- Privacy/terms screens complete.
- Analytics and crash monitoring integrated.
- Beta checklist complete for TestFlight + Android internal.

## 4) Test Strategy
- Unit tests:
  - parsing normalization
  - canonical mapping
  - permission guards
- Integration tests:
  - invite + join flow
  - founder restrictions
  - parse job lifecycle
- E2E smoke:
  - founder setup -> invite -> member onboarding -> grid render
- Manual QA scripts:
  - offline behavior
  - large screenshot batch
  - repeated parse failures + skip/retry

## 5) Cost Control Plan
- Start entirely on local/dev infra for development.
- Use free tiers for beta where possible.
- Hard limits:
  - max screenshots per batch
  - image compression + max dimensions
  - 24h artifact deletion
- Add basic operational metrics before inviting large groups.

## 6) Risks and Mitigations
- OCR quality variance:
  - Mitigation: parse review UX, unresolved placeholders, retries.
- Screenshot format drift:
  - Mitigation: parser adapter abstraction + normalization tests.
- Offline edge cases:
  - Mitigation: strict ownership model and LWW on user fields.
- Scope creep:
  - Mitigation: hold v1 line; defer recommendation card/Spotify/manual fallback.

## 7) Current Completion Snapshot
1. Monorepo foundation is in place.
2. API health/version shell is implemented.
3. Mobile navigation shell and core schedule flows are implemented.
4. Local infra compose file and env templates are present.
5. Integration coverage now includes group, canonical, personal, and schedule flows.
6. Canonical/personal imports run through a parser-based pipeline with dedupe/confidence handling.
7. Mobile app now persists cached state offline and replays queued schedule preference mutations on reconnect.
8. Expo release configuration now includes bundle/package identifiers and EAS build profiles.
