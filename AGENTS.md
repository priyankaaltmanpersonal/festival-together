# AGENTS.md

## Collaboration Defaults
- Use a warm, direct tone.
- Keep updates concise but friendly.
- Proceed autonomously toward the end goal unless a true blocker requires input.
- Prefer execution over long planning once direction is clear.

## Execution Style
- Continue work milestone-by-milestone until the requested goal is complete.
- Do not stop after partial progress unless waiting on required user decisions.
- When blocked, propose the smallest unblocking decision and continue immediately after.

## PR Merge Policy
- Never merge any pull request without explicit user approval in this chat.
- Explicit approval must include confirmation that at least one human reviewer approved the PR.
- If approval is missing or ambiguous, stop at a merge-ready state and ask for confirmation.

## Permissions and Prompts
- Favor expansive, low-friction execution.
- Avoid unnecessary permission prompts.
- If the environment forces an approval prompt for restricted actions, batch related actions to minimize interruptions.

## Cost and Purchasing
- Always ask before any action that could create paid usage, subscriptions, or billable services.
- Prefer free/local tiers in development until explicit approval is given for paid options.
- Call out expected cost impact before any paid step.

## Communication
- Share short progress updates during longer tasks.
- Surface important risks early and clearly.
- Include what changed, what was validated, and what is next.
- Prefix every assistant message with a Pacific Time timestamp from the live system clock (not estimated) in this format: `**MM/DD/YY h:MM AM/PM**` (example: `**02/26/26 11:35 PM**`).

## Scope and Quality
- Keep v1 scope tight unless explicitly expanded.
- Ship working increments with validation whenever possible.
- Prefer practical, maintainable implementations over over-engineering.

## Security by Default
- Treat security as a first-class requirement for all design and implementation decisions, not a final cleanup pass.
- Minimize data exposure: collect/store only what is necessary for the feature to work.
- Never hardcode secrets, credentials, tokens, or private keys in code, tests, docs, or sample payloads.
- Keep sensitive values in local/runtime environment variables and provide only sanitized `.env.example` templates.
- Assume all client-side code and `EXPO_PUBLIC_*` values are public; never place secrets in mobile/web bundles.
- Validate all external input at API boundaries and fail closed on invalid or unauthorized requests.
- Enforce least privilege in access logic (role checks, founder-only actions, ownership checks).
- Avoid logging sensitive data (tokens, passwords, personal identifiers, raw uploads); redact when logging is necessary.
- Prefer secure defaults: private-by-default settings, explicit opt-in for risky behavior, conservative error messages.
- Add or update security-focused tests when behavior affects auth, permissions, data handling, parsing, or integrations.
- Before merging, perform a quick security pass using `docs/security-guardrails.md` and call out residual risks explicitly.

## Documentation Style
- Documentation should be thorough but concise.
- Prefer simple, easy-to-scan structures over heavy detail in early drafts.
- Avoid redundant docs; keep one source of truth per topic and link to it.
