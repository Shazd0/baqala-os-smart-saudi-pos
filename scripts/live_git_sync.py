#!/usr/bin/env python3
"""Continuously sync this project between local Git and GitHub.

The script uses plain Git commands so it works with the existing GitHub remote.
It periodically commits local changes, rebases on the remote branch, and pushes
the result back to GitHub.
"""

from __future__ import annotations

import argparse
import datetime as dt
import subprocess
import sys
import time
from pathlib import Path


def run_git(repo: Path, args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    """Run a Git command in the target repository."""
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        text=True,
        capture_output=True,
        check=False,
    )

    if check and result.returncode != 0:
        command = "git " + " ".join(args)
        message = result.stderr.strip() or result.stdout.strip() or "unknown git error"
        raise RuntimeError(f"{command} failed:\n{message}")

    return result


def current_branch(repo: Path) -> str:
    result = run_git(repo, ["branch", "--show-current"])
    branch = result.stdout.strip()
    if not branch:
        raise RuntimeError("Could not detect the current Git branch.")
    return branch


def upstream_branch(repo: Path) -> str:
    result = run_git(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], check=False)
    upstream = result.stdout.strip()
    if result.returncode != 0 or not upstream:
        branch = current_branch(repo)
        raise RuntimeError(
            f"Branch '{branch}' has no upstream remote. Run: git push -u origin {branch}"
        )
    return upstream


def has_changes(repo: Path) -> bool:
    result = run_git(repo, ["status", "--porcelain"])
    return bool(result.stdout.strip())


def commit_local_changes(repo: Path, message_prefix: str, dry_run: bool) -> bool:
    if not has_changes(repo):
        return False

    timestamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    commit_message = f"{message_prefix} ({timestamp})"

    print("Local changes found.")
    if dry_run:
        print(f"DRY RUN: would commit with message: {commit_message}")
        return True

    run_git(repo, ["add", "-A"])
    run_git(repo, ["commit", "-m", commit_message])
    print(f"Committed local changes: {commit_message}")
    return True


def pull_remote(repo: Path, dry_run: bool) -> None:
    upstream = upstream_branch(repo)
    print(f"Pulling latest changes from {upstream}...")
    if dry_run:
        print("DRY RUN: would run git pull --rebase --autostash")
        return

    run_git(repo, ["pull", "--rebase", "--autostash"])


def push_local(repo: Path, dry_run: bool) -> None:
    print("Pushing local commits to GitHub...")
    if dry_run:
        print("DRY RUN: would run git push")
        return

    run_git(repo, ["push"])


def sync_once(repo: Path, message_prefix: str, dry_run: bool) -> None:
    """Run one complete local-to-cloud and cloud-to-local sync pass."""
    branch = current_branch(repo)
    print(f"\n[{dt.datetime.now().isoformat(timespec='seconds')}] Syncing branch '{branch}'")

    committed = commit_local_changes(repo, message_prefix, dry_run)
    pull_remote(repo, dry_run)
    push_local(repo, dry_run)

    if committed:
        print("Sync complete: local changes are on GitHub.")
    else:
        print("Sync complete: no local changes to commit.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Live sync a local Git repository with its GitHub remote."
    )
    parser.add_argument(
        "--repo",
        type=Path,
        default=Path.cwd(),
        help="Path to the local Git repository. Defaults to the current folder.",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=30,
        help="Seconds between sync checks. Defaults to 30.",
    )
    parser.add_argument(
        "--message-prefix",
        default="Live sync",
        help="Commit message prefix for automatic sync commits.",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run one sync pass and exit.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would happen without changing Git state.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo = args.repo.expanduser().resolve()

    if not (repo / ".git").exists():
        print(f"Not a Git repository: {repo}", file=sys.stderr)
        return 1

    try:
        if args.once:
            sync_once(repo, args.message_prefix, args.dry_run)
            return 0

        print(f"Watching {repo}")
        print("Press Ctrl+C to stop.")
        while True:
            sync_once(repo, args.message_prefix, args.dry_run)
            time.sleep(max(args.interval, 5))
    except KeyboardInterrupt:
        print("\nStopped live sync.")
        return 0
    except RuntimeError as error:
        print(f"\nSync stopped: {error}", file=sys.stderr)
        print("Resolve the Git issue, then run the script again.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
