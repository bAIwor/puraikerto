"""
gmi_client.py — thin wrapper around GMI Cloud's OpenAI-compatible API.
Handles auth, retries, prompt caching hints, and cost tracking.

Why this exists:
- API is OpenAI-compatible; a tiny wrapper gives us clear logging,
  easier mocking in tests, and one place to swap providers/models.
- Reasoning trace endpoints get the same client but with `temperature=0.2`
  for more deterministic multi-step output.

Model selection (priority order — no hardcode needed):
1. Pass `model=` explicitly to GMIClient()
2. Set GMI_MODEL env var in ~/.hermes/.env  → any GMI-hosted model
3. Falls back to DEFAULT_MODEL ("MiniMaxAI/MiniMax-M3") if neither is set

Auth:
- Read GMI_API_KEY from environment (NEVER hardcode).
- Set in ~/.hermes/.env on the VPS, or .env locally (chmod 600, gitignored).
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Iterator

import requests
from dotenv import load_dotenv

load_dotenv()  # picks up .env in cwd or parents

log = logging.getLogger("puraikerto.gmi")

DEFAULT_BASE_URL = "https://api.gmi-serving.com/v1"
DEFAULT_MODEL = "MiniMaxAI/MiniMax-M3"


class GMIError(RuntimeError):
    """Raised when the GMI API returns an error or is unreachable."""


@dataclass
class ChatMessage:
    role: str  # "system" | "user" | "assistant"
    content: str


@dataclass
class ChatResponse:
    content: str
    model: str
    usage: dict = field(default_factory=dict)
    cached_tokens: int = 0
    finish_reason: str = ""
    elapsed_ms: int = 0


class GMIClient:
    """Thin synchronous wrapper around GMI Cloud's chat completions endpoint.

    Usage:
        client = GMIClient()
        resp = client.chat(
            [ChatMessage("user", "balas dengan satu kata: oke")],
            max_tokens=20,
        )
        print(resp.content)
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout: int = 60,
        max_retries_override: int | None = None,
    ) -> None:
        self.api_key = api_key or os.environ.get("GMI_API_KEY")
        if not self.api_key:
            raise GMIError(
                "GMI_API_KEY not set. Set it in .env (chmod 600) or environment."
            )
        self.base_url = (base_url or os.environ.get("GMI_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self.model = model or os.environ.get("GMI_MODEL") or DEFAULT_MODEL
        self.timeout = timeout
        # max_retries_override: set to 1 for on-demand browser calls (fail fast),
        # leave None for cron calls (default 4 retries in chat())
        self.max_retries_override = max_retries_override
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "User-Agent": "purAIkerto/0.1 (+https://puraikerto.my.id)",
            }
        )
        log.info("GMIClient ready model=%s base=%s max_retries=%s", self.model, self.base_url, max_retries_override or "default")

    def chat(
        self,
        messages: list[ChatMessage],
        max_tokens: int = 1024,
        temperature: float = 0.7,
        response_format: dict | None = None,
        max_retries: int = 4,
    ) -> ChatResponse:
        """Send a chat completion request and return a parsed response.

        Retries on 429 (rate limit) and 5xx with exponential backoff, because
        GMI's free tier returns 429 "All endpoints are currently overloaded"
        under load. Without retry a single 429 silently leaves a grid stale.
        Honours the Retry-After header when the server sends one.
        """
        # instance-level override wins (e.g. --max-retries 1 for browser calls)
        if self.max_retries_override is not None:
            max_retries = self.max_retries_override

        payload: dict = {
            "model": self.model,
            "messages": [m.__dict__ for m in messages],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if response_format:
            payload["response_format"] = response_format

        last_err: str = ""
        for attempt in range(max_retries):
            t0 = time.time()
            try:
                r = self.session.post(
                    f"{self.base_url}/chat/completions",
                    json=payload,
                    timeout=self.timeout,
                )
            except requests.RequestException as e:
                last_err = f"network error: {e}"
                if attempt == max_retries - 1:
                    raise GMIError(last_err) from e
                delay = min(2.0 * (2 ** attempt), 30.0)
                log.warning(
                    "m3 %s — retry %d/%d in %.1fs",
                    last_err, attempt + 1, max_retries - 1, delay,
                )
                time.sleep(delay)
                continue
            elapsed = int((time.time() - t0) * 1000)

            # transient: rate limit or server-side failure → back off and retry
            if r.status_code == 429 or r.status_code >= 500:
                snippet = (r.text or "")[:200]
                last_err = f"HTTP {r.status_code}: {snippet}"
                if attempt == max_retries - 1:
                    raise GMIError(last_err)
                retry_after = r.headers.get("Retry-After")
                if retry_after and retry_after.isdigit():
                    delay = min(float(retry_after), 60.0)
                else:
                    delay = min(2.0 * (2 ** attempt), 30.0)
                log.warning(
                    "m3 %s — retry %d/%d in %.1fs",
                    last_err, attempt + 1, max_retries - 1, delay,
                )
                time.sleep(delay)
                continue

            # permanent failure (4xx other than 429): no point retrying
            if r.status_code != 200:
                snippet = r.text[:300] if r.text else ""
                raise GMIError(f"HTTP {r.status_code}: {snippet}")

            break
        else:  # pragma: no cover - loop always breaks or raises
            raise GMIError(last_err or "exhausted retries")

        data = r.json()
        try:
            choice = data["choices"][0]
            content = choice["message"]["content"]
            finish = choice.get("finish_reason", "")
        except (KeyError, IndexError, TypeError) as e:
            raise GMIError(f"malformed response: {data}") from e

        usage = data.get("usage", {})
        cached = (usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0)
        log.info(
            "m3 chat tokens=%s cached=%s elapsed=%dms",
            usage.get("total_tokens", "?"),
            cached,
            elapsed,
        )
        return ChatResponse(
            content=content,
            model=data.get("model", self.model),
            usage=usage,
            cached_tokens=cached,
            finish_reason=finish,
            elapsed_ms=elapsed,
        )

    def chat_json(
        self,
        messages: list[ChatMessage],
        max_tokens: int = 2048,
        temperature: float = 0.2,
    ) -> dict:
        """Convenience: request a JSON response. Uses response_format to force JSON.

        On parse failure, raises GMIError with the raw text in the message so the
        caller can decide whether to retry, fall back, or log + skip.
        """
        resp = self.chat(
            messages,
            max_tokens=max_tokens,
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        text = resp.content.strip()
        # strip code fences if model adds them anyway
        if text.startswith("```"):
            text = text.strip("`")
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise GMIError(f"json parse failed: {e}; raw={text[:300]}") from e


# convenience module-level instance for one-off scripts
_default_client: GMIClient | None = None


def get_client() -> GMIClient:
    global _default_client
    if _default_client is None:
        _default_client = GMIClient()
    return _default_client
