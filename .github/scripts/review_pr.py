"""
Claude code review agent.

Triggered by GitHub Actions on PR open/update/ready-for-review events.
Posts an inline review and auto-merges when the PR is approved.
"""

import json
import os
import re
import subprocess
import sys
import tempfile

import anthropic

MODEL = "claude-sonnet-4-6"
MAX_DIFF_CHARS = 120_000
SHA_MARKER_PREFIX = "<!-- claude-sha:"


def run(cmd: str) -> str:
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Command failed: {cmd}\nstderr: {result.stderr}", file=sys.stderr)
    return result.stdout.strip()


def already_reviewed(repo: str, pr_number: str, head_sha: str) -> bool:
    """Return True if we have already posted a review for this exact commit."""
    raw = run(f"gh api repos/{repo}/pulls/{pr_number}/reviews")
    if not raw:
        return False
    reviews = json.loads(raw)
    marker = f"{SHA_MARKER_PREFIX} {head_sha} -->"
    return any(marker in (r.get("body") or "") for r in reviews)


def get_valid_lines(diff_text: str) -> set[tuple[str, int]]:
    """
    Parse a unified diff and return the set of (file_path, line_number) pairs
    that correspond to added/context lines in the new file version.
    Only these are valid targets for GitHub inline review comments.
    """
    valid: set[tuple[str, int]] = set()
    current_file: str | None = None
    new_line_num = 0

    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            current_file = line[6:]
            new_line_num = 0
        elif line.startswith("@@") and current_file:
            match = re.search(r"\+(\d+)(?:,\d+)?", line)
            if match:
                new_line_num = int(match.group(1)) - 1
        elif current_file:
            if line.startswith("+"):
                new_line_num += 1
                valid.add((current_file, new_line_num))
            elif not line.startswith("-"):
                new_line_num += 1

    return valid


def call_claude(pr_title: str, pr_body: str, diff: str, truncated: bool) -> dict:
    system_prompt = """\
You are a senior production engineer conducting a thorough pull request review.
Your goal is to catch real problems before they reach production.

Review focus areas (in priority order):
1. Bugs: logic errors, off-by-one errors, null/undefined handling, wrong conditions
2. Security: auth bypass, secrets exposure, injection, missing input validation
3. Data integrity: race conditions, missing transactions, orphaned records
4. Performance: N+1 queries, unnecessary re-renders, blocking operations, no debounce
5. API design: breaking changes, missing error handling, inconsistent behavior
6. UX correctness: missing loading/error/empty states, confusing defaults

Do NOT flag:
- Style, formatting, or naming preferences with no correctness impact
- Things that are clearly intentional and well-understood tradeoffs
- Hypothetical future problems with no current evidence

Output ONLY valid JSON. No markdown fences, no explanation outside the JSON.

{
  "verdict": "approve" | "request_changes" | "comment",
  "summary": "2-4 sentence overall assessment. Be specific about what is good and what needs work.",
  "comments": [
    {
      "path": "relative/file/path.ext",
      "line": <integer line number in the new version of the file>,
      "body": "Specific issue with explanation and a concrete fix suggestion."
    }
  ]
}

Rules:
- Use "approve" only if the PR is genuinely production-ready with no bugs or security issues.
- Use "request_changes" if there are bugs, security issues, or problems that must be fixed.
- Use "comment" for feedback that is useful but does not block merging.
- Line numbers must be exact lines that appear in the diff (added or context lines only).
- If you are unsure of the exact line number, omit that comment rather than guess.
- If there are no inline comments, use an empty array.\
"""

    truncation_note = " (truncated to first 120K characters)" if truncated else ""
    user_message = (
        f"PR: {pr_title}\n\n"
        f"Description:\n{pr_body or '(none)'}\n\n"
        f"Diff{truncation_note}:\n{diff}"
    )

    client = anthropic.Anthropic()
    response = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text.strip()

    # Strip markdown code fences if the model added them despite instructions
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Last resort: find the outermost JSON object
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            return json.loads(match.group())
        print(f"Could not parse Claude response as JSON:\n{raw}", file=sys.stderr)
        sys.exit(1)


def post_review(
    repo: str,
    pr_number: str,
    head_sha: str,
    verdict: str,
    summary: str,
    comments: list[dict],
    valid_lines: set[tuple[str, int]],
) -> int:
    event_map = {
        "approve": "APPROVE",
        "request_changes": "REQUEST_CHANGES",
        "comment": "COMMENT",
    }
    emoji_map = {"approve": "✅", "request_changes": "🔴", "comment": "💬"}

    gh_event = event_map.get(verdict, "COMMENT")
    emoji = emoji_map.get(verdict, "💬")

    body = (
        f"{emoji} **Claude Code Review**\n\n"
        f"{summary}\n\n"
        f"{SHA_MARKER_PREFIX} {head_sha} -->"
    )

    # Step 1: post the review body without inline comments (always succeeds)
    review_payload = {
        "commit_id": head_sha,
        "body": body,
        "event": gh_event,
    }

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(review_payload, f)
        review_payload_path = f.name

    result = run(
        f"gh api repos/{repo}/pulls/{pr_number}/reviews --method POST --input {review_payload_path}"
    )
    review = json.loads(result) if result else {}
    review_id = review.get("id")
    if not review_id:
        print("Failed to post review body — aborting.", file=sys.stderr)
        sys.exit(1)
    print(f"Posted review {review_id}: {gh_event}")

    # Step 2: post each inline comment individually so a bad line number
    # doesn't block the others.
    posted = 0
    for c in comments:
        path = c.get("path", "")
        line = c.get("line")
        comment_body = c.get("body", "")
        if not (path and line and comment_body):
            continue

        # Snap to nearest valid diff line (±2 tolerance for model off-by-one)
        if (path, line) not in valid_lines:
            found = None
            for delta in (-1, 1, -2, 2):
                if (path, line + delta) in valid_lines:
                    found = line + delta
                    break
            if found:
                line = found
            else:
                print(f"Skipping comment at {path}:{line} (not in diff)", file=sys.stderr)
                continue

        comment_payload = {
            "body": comment_body,
            "commit_id": head_sha,
            "path": path,
            "line": line,
            "side": "RIGHT",
        }

        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(comment_payload, f)
            comment_payload_path = f.name

        comment_result = run(
            f"gh api repos/{repo}/pulls/{pr_number}/comments --method POST --input {comment_payload_path}"
        )
        if comment_result:
            posted += 1
        else:
            print(f"Failed to post comment at {path}:{line}", file=sys.stderr)

    print(f"Posted {posted} inline comment(s)")
    return review_id


def auto_merge(repo: str, pr_number: str) -> None:
    print("Verdict is APPROVE — triggering auto-merge (squash)...")
    out = run(f"gh pr merge {pr_number} --repo {repo} --squash --auto --delete-branch")
    print(out or "Auto-merge queued.")


def main() -> None:
    pr_number = os.environ["PR_NUMBER"]
    repo = os.environ["REPO"]
    head_sha = os.environ["HEAD_SHA"]

    print(f"Reviewing PR #{pr_number} at {head_sha} in {repo}")

    if already_reviewed(repo, pr_number, head_sha):
        print(f"Already reviewed commit {head_sha} — skipping.")
        return

    # Fetch PR metadata
    pr_raw = run(
        f"gh pr view {pr_number} --repo {repo} --json title,body"
    )
    pr = json.loads(pr_raw) if pr_raw else {}
    pr_title = pr.get("title", f"PR #{pr_number}")
    pr_body = pr.get("body") or ""

    # Fetch diff
    diff = run(f"gh pr diff {pr_number} --repo {repo}")
    if not diff.strip():
        print("Empty diff — nothing to review.")
        return

    truncated = len(diff) > MAX_DIFF_CHARS
    if truncated:
        diff = diff[:MAX_DIFF_CHARS]
        print(f"Diff truncated to {MAX_DIFF_CHARS} characters.")

    valid_lines = get_valid_lines(diff)
    print(f"Diff parsed: {len(valid_lines)} reviewable lines across {len({p for p, _ in valid_lines})} file(s)")

    # Call Claude
    print("Calling Claude...")
    result = call_claude(pr_title, pr_body, diff, truncated)

    verdict = result.get("verdict", "comment")
    summary = result.get("summary", "")
    comments = result.get("comments", [])
    print(f"Claude verdict: {verdict} | {len(comments)} comment(s) proposed")

    # Post review
    post_review(repo, pr_number, head_sha, verdict, summary, comments, valid_lines)

    # Auto-merge on approval
    if verdict == "approve":
        auto_merge(repo, pr_number)


if __name__ == "__main__":
    main()
