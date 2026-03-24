# Parser Worker

Consumes parse jobs and converts screenshot batches into normalized schedule records.

## Responsibilities
- OCR/extraction adapter
- dedupe/merge for long-scroll screenshot overlap
- canonical mapping + unresolved classification
- artifact retention cleanup hooks

## Local Commands
- Preview the demo parser flow:
  - `../../.venv/bin/python worker/main.py preview-demo --screenshots 4`
- Mark expired artifacts as deleted in the API SQLite database:
  - `../../.venv/bin/python worker/main.py cleanup-artifacts --db-path ../api/coachella.db`
