#!/usr/bin/env python3

import json
import select
import shutil
import subprocess
import sys
import time
from pathlib import Path

CACHE_TTL_SECONDS = 60
LOCK_STALE_SECONDS = 120
FRESH_DOT_STALE_SECONDS = 600


def _drain_stdin() -> None:
    try:
        if not sys.stdin.isatty():
            ready, _, _ = select.select([sys.stdin], [], [], 0)
            if ready:
                sys.stdin.read()
    except Exception:
        return


def _format_tokens(tokens: float) -> str:
    if tokens >= 1_000_000:
        return f"{tokens / 1_000_000:.1f}M"
    if tokens >= 100_000:
        return f"{tokens / 1_000:.0f}K"
    return f"{tokens / 1_000:.1f}K"


def _format_cost(cost: float) -> str:
    return f"${cost:.2f}"


def _read_cache(cache_file: Path):
    try:
        with cache_file.open("r") as handle:
            return json.load(handle)
    except Exception:
        return None


def _spawn_refresh(cache_file: Path, lock_file: Path) -> None:
    try:
        lock_file.parent.mkdir(parents=True, exist_ok=True)
        lock_file.touch()
        timeout_cmd = shutil.which("gtimeout") or shutil.which("timeout")
        tmp_file = f"{cache_file}.tmp"
        if timeout_cmd:
            cmd = (
                f'{timeout_cmd} 30 occusage --json > "{tmp_file}" '
                f'&& mv "{tmp_file}" "{cache_file}" '
                f'&& rm -f "{lock_file}" || rm -f "{lock_file}"'
            )
        else:
            cmd = (
                f'occusage --json > "{tmp_file}" '
                f'&& mv "{tmp_file}" "{cache_file}" '
                f'&& rm -f "{lock_file}"'
            )
        subprocess.Popen(
            ["sh", "-c", cmd],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception:
        try:
            if lock_file.exists():
                lock_file.unlink()
        except Exception:
            pass


def get_token_usage():
    cache_file = Path.home() / ".cache" / "occusage-statusline.json"
    lock_file = Path.home() / ".cache" / "occusage-statusline.lock"

    cache_data = None
    cache_age = float("inf")

    if cache_file.exists():
        cache_data = _read_cache(cache_file)
        if cache_data is not None:
            try:
                cache_age = time.time() - cache_file.stat().st_mtime
            except Exception:
                pass

    needs_refresh = cache_age >= CACHE_TTL_SECONDS

    lock_is_stale = False
    if lock_file.exists():
        try:
            lock_age = time.time() - lock_file.stat().st_mtime
            if lock_age > LOCK_STALE_SECONDS:
                lock_is_stale = True
                lock_file.unlink()
        except Exception:
            pass

    if needs_refresh and (not lock_file.exists() or lock_is_stale):
        _spawn_refresh(cache_file, lock_file)

    if not cache_data:
        return None

    totals = cache_data.get("totals", {})
    tokens = float(totals.get("totalTokens", 0) or 0)
    cost = float(totals.get("totalCost", 0) or 0)

    if tokens <= 0 and cost <= 0:
        return None

    parts = []
    if tokens > 0:
        parts.append(f"🔥 {_format_tokens(tokens)}")
    if cost > 0:
        parts.append(f"💸 {_format_cost(cost)}")

    dot = "●" if cache_age < FRESH_DOT_STALE_SECONDS else "○"
    return f"{' '.join(parts)} {dot}".strip()


def main() -> None:
    _drain_stdin()
    token_info = get_token_usage()
    if token_info:
        print(token_info)


if __name__ == "__main__":
    main()
