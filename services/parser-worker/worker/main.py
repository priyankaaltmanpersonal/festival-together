from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import sys


ROOT = Path(__file__).resolve().parents[3]
API_SERVICE_DIR = ROOT / "services" / "api"
if str(API_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(API_SERVICE_DIR))

from app.core.parser import build_demo_canonical_screenshots, parse_canonical_screenshots  # noqa: E402


def cleanup_artifacts(db_path: str, now: datetime | None = None) -> int:
    cutoff = (now or datetime.now(tz=timezone.utc)).isoformat()
    with sqlite3.connect(db_path) as conn:
        try:
            result = conn.execute(
                """
                UPDATE parse_artifacts
                SET deleted_at = ?
                WHERE deleted_at IS NULL AND retention_expires_at <= ?
                """,
                (cutoff, cutoff),
            )
            conn.commit()
            return result.rowcount
        except sqlite3.OperationalError as exc:
            if "no such table" in str(exc):
                return 0
            raise


def preview_demo_parse(screenshot_count: int) -> str:
    outcome = parse_canonical_screenshots(build_demo_canonical_screenshots(screenshot_count))
    return (
        f"parsed_sets={len(outcome.sets)} "
        f"unresolved={outcome.unresolved_count} "
        f"first_artist={outcome.sets[0].artist_name if outcome.sets else 'none'}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Festival Together parser worker utilities")
    subparsers = parser.add_subparsers(dest="command", required=True)

    preview_parser = subparsers.add_parser("preview-demo", help="Preview the canonical parse pipeline")
    preview_parser.add_argument("--screenshots", type=int, default=4)

    cleanup_parser = subparsers.add_parser("cleanup-artifacts", help="Mark expired parse artifacts as deleted")
    cleanup_parser.add_argument("--db-path", required=True)

    args = parser.parse_args()
    if args.command == "preview-demo":
        print(preview_demo_parse(args.screenshots))
        return

    if args.command == "cleanup-artifacts":
        print(f"deleted={cleanup_artifacts(args.db_path)}")


if __name__ == "__main__":
    main()
