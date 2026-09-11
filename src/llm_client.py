"""
llm_client.py — Drop-in replacement for gmi_client.py

Uses OpenRouter (OpenAI-compatible) with whatever model is configured.
Falls back gracefully on 429 / 5xx with exponential backoff.

Environment variables (read from .hermes/.env or .env in repo root):
  OPENROUTER_API_KEY  — required
  LLM_MODEL           — optional, default: google/gemini-2.5-flash-lite
  LLM_BASE_URL        — optional, default: https://openrouter.ai/api/v1
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests

log = logging.getLogger("puraikerto.llm")

# ── Config ─────────────────────────────────────────────────────────────

def _load_env_file(*paths: str) -> dict[str, str]:
    """Load key=value pairs from the first existing env file."""
    for p in paths:
        path = Path(p).expanduser()
        if path.exists():
            env: dict[str, str] = {}
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    env[k.strip()] = v.strip().strip('"').strip("'")
            return env
    return {}

def _get_config() -> dict[str, str]:
    """Merge env file + os.environ. os.environ wins."""
    env = _load_env_file(
        "~/.hermes/.env",
        str(Path(__file__).parents[1] / ".env"),
    )
    env.update(os.environ)
    return env


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
    """OpenRouter-backed chat client, drop-in for GMIClient."""

    DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
    DEFAULT_MODEL    = "google/gemini-2.5-flash-lite"
    MAX_RETRIES      = 4
    RETRY_DELAYS     = [2, 4, 8, 16]   # seconds between attempts

    def __init__(
        self,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        max_retries_override: Optional[int] = None,
    ):
        cfg = _get_config()
        self.api_key  = cfg.get("OPENROUTER_API_KEY", "")
        self.model    = model or cfg.get("LLM_MODEL", self.DEFAULT_MODEL)
        self.base_url = (base_url or cfg.get("LLM_BASE_URL", self.DEFAULT_BASE_URL)).rstrip("/")
        self.retries  = max_retries_override if max_retries_override is not None else self.MAX_RETRIES

        if not self.api_key:
            raise LLMError("OPENROUTER_API_KEY not set in env or .hermes/.env")

        log.info(
            "LLMClient ready model=%s base=%s max_retries=%s",
            self.model, self.base_url,
            "default" if max_retries_override is None else max_retries_override,
        )

    def chat(
        self,
        messages: list[ChatMessage],
        *,
        json_mode: bool = False,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> str:
        """
        Send a chat completion request. Returns the assistant's text content.
        Raises LLMError on unrecoverable failure.
        """
        payload: dict = {
            "model": self.model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://puraikerto.my.id",
            "X-Title": "purAIkerto",
        }

        last_err: Exception = LLMError("no attempts made")
        for attempt in range(self.retries + 1):
            try:
                resp = requests.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                    timeout=90,
                )
            except requests.RequestException as e:
                last_err = LLMError(f"network error: {e}")
                log.warning("attempt %d/%d network error: %s", attempt + 1, self.retries + 1, e)
            else:
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        return data["choices"][0]["message"]["content"]
                    except (KeyError, IndexError, ValueError) as e:
                        raise LLMError(f"unexpected response shape: {e} — {resp.text[:200]}")

                if resp.status_code in (429, 503, 529):
                    retry_after = int(resp.headers.get("Retry-After", 0))
                    delay = retry_after or (self.RETRY_DELAYS[min(attempt, len(self.RETRY_DELAYS) - 1)])
                    log.warning(
                        "attempt %d/%d HTTP %d, retrying in %ds",
                        attempt + 1, self.retries + 1, resp.status_code, delay,
                    )
                    last_err = LLMError(f"HTTP {resp.status_code}: {resp.text[:200]}")
                else:
                    # Non-retryable (400, 401, 402, etc.)
                    raise LLMError(f"HTTP {resp.status_code}: {resp.text[:300]}")

            if attempt < self.retries:
                delay = self.RETRY_DELAYS[min(attempt, len(self.RETRY_DELAYS) - 1)]
                time.sleep(delay)

        raise last_err


# Alias so existing code using GMIClient still works
GMIClient = LLMClient
