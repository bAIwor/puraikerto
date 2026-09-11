"""
llm_client.py — Hermes CLI-backed LLM client for puraikerto

Delegates all LLM calls to `hermes chat -q "..." --oneshot` on the VPS.
Uses whatever model Hermes is currently configured with — zero API key
management needed in puraikerto itself.

Compatible interface: GMIClient / GMIError / ChatMessage aliases retained
so curate.py and reason.py need no changes.
"""

from __future__ import annotations

import json
import logging
import shlex
import subprocess
import tempfile
import os
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("puraikerto.llm")

HERMES_BIN = os.environ.get("HERMES_BIN", "hermes")


# ── Data classes (same interface as gmi_client) ─────────────────────────

@dataclass
class ChatMessage:
    role: str
    content: str


class LLMError(Exception):
    pass

# Alias so existing code using GMIError still works
GMIError = LLMError


# ── Client ──────────────────────────────────────────────────────────────

class LLMClient:
    """
    Hermes CLI-backed chat client.
    Calls: hermes chat -q "<prompt>" --oneshot [-m model]
    """

    def __init__(
        self,
        model: Optional[str] = None,
        base_url: Optional[str] = None,       # ignored, kept for compat
        max_retries_override: Optional[int] = None,
    ):
        self.model   = model  # None = use whatever Hermes default is
        self.retries = max_retries_override if max_retries_override is not None else 2

        log.info(
            "LLMClient ready via hermes chat --oneshot model=%s",
            self.model or "(hermes default)",
        )

    def _build_prompt(self, messages: list[ChatMessage]) -> str:
        """
        Flatten messages into a single prompt string.
        system message becomes a preamble, then user/assistant turns.
        """
        parts = []
        for m in messages:
            if m.role == "system":
                parts.append(f"[SYSTEM]\n{m.content}")
            elif m.role == "user":
                parts.append(f"[USER]\n{m.content}")
            elif m.role == "assistant":
                parts.append(f"[ASSISTANT]\n{m.content}")
        return "\n\n".join(parts)

    def chat(
        self,
        messages: list[ChatMessage],
        *,
        json_mode: bool = False,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> str:
        """
        Send messages via `hermes chat --oneshot`.
        Returns the assistant's text response.
        Raises LLMError on failure.
        """
        prompt = self._build_prompt(messages)
        if json_mode:
            prompt += "\n\nRespond ONLY with valid JSON, no markdown fences."

        cmd = [HERMES_BIN, "chat", "--oneshot", "-Q", "-q", prompt]
        if self.model:
            cmd += ["-m", self.model]

        last_err: Exception = LLMError("no attempts made")
        for attempt in range(self.retries + 1):
            try:
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if result.returncode == 0 and result.stdout.strip():
                    # Strip session_id: ... line that hermes prepends
                    lines = result.stdout.strip().splitlines()
                    lines = [l for l in lines if not l.startswith("session_id:")]
                    return "\n".join(lines).strip()

                err_msg = (result.stderr or result.stdout or "empty output").strip()
                last_err = LLMError(f"hermes exit {result.returncode}: {err_msg[:200]}")
                log.warning("attempt %d/%d failed: %s", attempt + 1, self.retries + 1, err_msg[:100])

            except subprocess.TimeoutExpired:
                last_err = LLMError("hermes chat timed out after 120s")
                log.warning("attempt %d/%d timed out", attempt + 1, self.retries + 1)
            except FileNotFoundError:
                raise LLMError(f"hermes binary not found at '{HERMES_BIN}'. Set HERMES_BIN env var.")

        raise last_err

    def chat_json(
        self,
        messages: list[ChatMessage],
        *,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> dict:
        """
        Like chat(), but parses the response as JSON.
        Raises LLMError if response is not valid JSON.
        """
        raw = self.chat(messages, json_mode=True, temperature=temperature, max_tokens=max_tokens)
        # Strip markdown code fences if model wraps JSON in ```json ... ```
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            text = text.rsplit("```", 1)[0]
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise LLMError(f"response is not valid JSON: {e} — {raw[:300]}")


# Alias so existing code using GMIClient still works
GMIClient = LLMClient
