"""
reason.py — reasoning trace generator for purAIkerto

What this does:
- For a given news item, asks M3 to plan a verification (the "plan" in
  Track 1's "holds a plan" requirement)
- Then asks M3 to walk the plan step-by-step, citing 2+ sources it would
  check (the "fact check themselves" requirement)
- Returns a structured trace that the frontend can render as an expandable
  panel — NOT a black-box answer

Why this matters for the contest:
- The judging criteria explicitly asks for agents that "hold a plan" and
  "fact check themselves". This module is what makes that *visible* to
  the user.
- The trace is also stored so other items / re-checks can reference it,
  and so the demo video can show "the agent thought, then did, then
  verified, then concluded" in a way a black-box chatbot never can.

Usage:
    python reason.py --item '{"title":"...", "url":"...", "summary":"..."}'
    python reason.py --from-cache RADAR  # reason about top RADAR item
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterator

from gmi_client import GMIClient, ChatMessage, GMIError

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("puraikerto.reason")

WIB_OFFSET_HOURS = 7


@dataclass
class TraceStep:
    step: int
    action: str          # what the agent did, e.g. "Identify claim"
    detail: str          # what it found or decided, e.g. "claim is a release date"
    outcome: str = ""    # short verdict: "ok" | "weak" | "no" | "unknown"


@dataclass
class ReasoningTrace:
    item_title: str
    item_url: str
    plan: list[str]                                # the plan before execution
    steps: list[TraceStep] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)  # URLs that would be / were checked
    confidence: float = 0.0
    summary: str = ""
    model: str = ""
    elapsed_ms: int = 0
    error: str = ""


SYSTEM_PROMPT = (
    "Kamu adalah bAIwor, AI agent yang memegang rencana dan self-faktanya terlihat. "
    "Tugas: untuk sebuah klaim/berita AI, kamu membuat PLAN dulu, lalu "
    "menjalankannya step-by-step. Setiap step WAJIB ada outcome yang jujur "
    "(termasuk 'tidak yakin' / 'sumber tidak konfirmasi' / 'hanya 1 sumber, lemah'). "
    "Output JSON object dengan key:\n"
    "  plan: array of 3-5 langkah rencana (string)\n"
    "  steps: array of {step, action, detail, outcome}  (step = int, mulai dari 1)\n"
    "  sources: array of URL atau nama sumber yang dicek (string)\n"
    "  confidence: 0..1 (float, jujur! 0.3 = lemah, 0.9 = sangat yakin)\n"
    "  summary: 1-2 kalimat kesimpulan untuk user akhir\n"
    "JANGAN mengarang URL palsu. Jika tidak yakin sebut 'unknown' di outcome."
)


import re as _re


def _strip_html(s: str) -> str:
    """Remove HTML tags and unescape common entities from a feed summary."""
    if not s:
        return ""
    s = _re.sub(r"<[^>]+>", " ", s)          # drop tags
    s = _re.sub(r"&nbsp;", " ", s)
    s = _re.sub(r"&amp;", "&", s)
    s = _re.sub(r"&quot;", '"', s)
    s = _re.sub(r"&#39;|&apos;", "'", s)
    s = _re.sub(r"&lt;", "<", s)
    s = _re.sub(r"&gt;", ">", s)
    s = _re.sub(r"\s+", " ", s)
    return s.strip()


def _item_to_user(item: dict) -> str:
    title = _strip_html(item.get("title", "")).strip()
    url = item.get("url", "").strip()
    source = _strip_html(item.get("source", "")).strip()
    summary = _strip_html(item.get("summary", "")).strip()[:600]
    return (
        f"Item untuk diverifikasi:\n"
        f"Title: {title}\n"
        f"URL: {url}\n"
        f"Source: {source}\n"
        f"Summary: {summary}\n\n"
        f"Buat plan, jalankan step-by-step, dan akhiri dengan confidence + summary."
    )


def generate_trace(client: GMIClient, item: dict) -> ReasoningTrace:
    """Generate a reasoning trace for a single item. Returns ReasoningTrace (with
    `error` field set on failure — caller decides what to do)."""
    trace = ReasoningTrace(
        item_title=item.get("title", ""),
        item_url=item.get("url", ""),
        plan=[],
    )
    try:
        resp = client.chat_json(
            [
                ChatMessage("system", SYSTEM_PROMPT),
                ChatMessage("user", _item_to_user(item)),
            ],
            max_tokens=2200,
            temperature=0.2,
        )
    except GMIError as e:
        trace.error = f"m3 call failed: {e}"
        log.error(trace.error)
        return trace

    plan_raw = resp.get("plan", [])
    if isinstance(plan_raw, list):
        trace.plan = [str(x).strip() for x in plan_raw if str(x).strip()]

    steps_raw = resp.get("steps", [])
    for s in steps_raw if isinstance(steps_raw, list) else []:
        try:
            trace.steps.append(
                TraceStep(
                    step=int(s.get("step", 0)),
                    action=str(s.get("action", "")).strip(),
                    detail=str(s.get("detail", "")).strip(),
                    outcome=str(s.get("outcome", "")).strip(),
                )
            )
        except (ValueError, TypeError, AttributeError):
            continue

    sources_raw = resp.get("sources", [])
    if isinstance(sources_raw, list):
        trace.sources = [str(x).strip() for x in sources_raw if str(x).strip()]

    try:
        trace.confidence = float(resp.get("confidence", 0.0))
    except (ValueError, TypeError):
        trace.confidence = 0.0
    trace.summary = str(resp.get("summary", "")).strip()
    trace.model = getattr(client, "model", "")
    # elapsed not returned from chat_json directly; estimate if needed
    return trace


def trace_to_dict(t: ReasoningTrace) -> dict:
    d = asdict(t)
    # ensure steps is list of dicts (asdict already does this)
    return d


# ---------- cache IO ----------

def write_trace_cache(traces: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    payload = {
        "generated_at": _now_iso(),
        "traces": traces,
    }
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)
    log.info("wrote %d traces to %s", len(traces), path)


def read_trace_cache(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        log.warning("read_trace_cache failed: %s", e)
        return None


def _now_iso() -> str:
    from datetime import datetime, timezone, timedelta
    return datetime.now(timezone(timedelta(hours=WIB_OFFSET_HOURS))).isoformat()


# ---------- main ----------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--item", help="JSON string of item, e.g. '{\"title\":\"...\"}'")
    ap.add_argument("--from-cache", metavar="GRID", help="reason about items in this grid from cache_feed.json")
    ap.add_argument("--feed-cache", type=Path, default=Path(__file__).parent.parent / "api" / "cache_feed.json")
    ap.add_argument("--out", type=Path, default=Path(__file__).parent.parent / "api" / "cache_reason.json")
    ap.add_argument("--limit", type=int, default=3, help="max items per grid to reason about")
    args = ap.parse_args()

    if not args.item and not args.from_cache:
        ap.error("must supply --item or --from-cache GRID")

    client = GMIClient()
    items: list[dict] = []

    if args.item:
        try:
            items = [json.loads(args.item)]
        except json.JSONDecodeError as e:
            log.error("bad --item JSON: %s", e)
            return 2
    else:
        cache = json.loads(args.feed_cache.read_text(encoding="utf-8"))
        grid_items = cache.get("grids", {}).get(args.from_cache, [])
        items = grid_items[: args.limit]
        log.info("reasoning about %d items from %s", len(items), args.from_cache)

    traces_out = []
    for it in items:
        t = generate_trace(client, it)
        d = trace_to_dict(t)
        if not t.error:
            log.info(
                "traced '%s' — confidence=%.2f steps=%d",
                (t.item_title or "")[:60],
                t.confidence,
                len(t.steps),
            )
        else:
            # still emit a trace object so the endpoint can render a graceful panel
            log.warning("trace for '%s' carried error: %s", (t.item_title or "")[:60], t.error)
        traces_out.append(d)

    write_trace_cache(traces_out, args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
