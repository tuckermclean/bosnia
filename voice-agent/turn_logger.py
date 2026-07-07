"""Per-turn conversation logging for the voice tutor.

Every turn (role + Bosnian text, plus level/scenario/session metadata) is
logged to stdout unconditionally -- that never depends on any configuration
and can never fail silently. If BACKEND_TURNS_URL (and, optionally,
BACKEND_TURNS_TOKEN) is configured, turns are ALSO POSTed, best-effort, to the
backend's `tutor_turns` endpoint (see the project plan's `POST
/api/tutor/session` / `tutor_turns` table). Backend delivery is fire-and-
forget: a slow or failing backend must never block or crash the live voice
loop, and a failed delivery never drops the turn from the local log.

Speaker attribution and timestamps are never stripped here -- downstream
consumers (review tooling, the `tutor_turns` history) depend on both.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import asdict, dataclass
from typing import Literal

logger = logging.getLogger("voice-agent.turns")

Role = Literal["user", "assistant"]


@dataclass(frozen=True)
class TurnRecord:
    session_id: str
    role: Role
    text: str
    level: str
    scenario: str | None
    created_at: float

    def to_dict(self) -> dict:
        return asdict(self)


class TurnLogger:
    """Logs turns to stdout and, optionally, to the backend.

    Construct one instance per LiveKit room/session. The HTTP client
    (`httpx.AsyncClient`) is created lazily on first backend delivery, so
    simply constructing a `TurnLogger` -- or importing this module -- never
    touches the network, even when a backend URL is configured.
    """

    def __init__(
        self,
        session_id: str,
        *,
        backend_url: str | None = None,
        backend_token: str | None = None,
        http_timeout_s: float = 5.0,
    ) -> None:
        self._session_id = session_id
        self._backend_url = backend_url
        self._backend_token = backend_token
        self._http_timeout_s = http_timeout_s
        self._client = None  # type: ignore[var-annotated]  # created lazily, see _get_client
        self._pending: set[asyncio.Task] = set()

    def _get_client(self):
        if self._client is None:
            import httpx  # local import: only needed if/when backend delivery is used

            self._client = httpx.AsyncClient(timeout=self._http_timeout_s)
        return self._client

    def log_turn(
        self,
        role: Role,
        text: str,
        *,
        level: str,
        scenario: str | None = None,
    ) -> None:
        """Log a turn now (stdout, synchronous); ship to the backend in the
        background if configured. Safe to call from a synchronous event
        handler (e.g. `AgentSession`'s `conversation_item_added`)."""
        record = TurnRecord(
            session_id=self._session_id,
            role=role,
            text=text,
            level=level,
            scenario=scenario,
            created_at=time.time(),
        )
        logger.info("turn %s", json.dumps(record.to_dict(), ensure_ascii=False))

        if not self._backend_url:
            return

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.warning(
                "no running event loop; skipping backend delivery for this turn "
                "(it is still in the local log above)"
            )
            return

        task = loop.create_task(self._post_turn(record))
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)

    async def _post_turn(self, record: TurnRecord) -> None:
        try:
            client = self._get_client()
            headers = {"Content-Type": "application/json"}
            if self._backend_token:
                headers["Authorization"] = f"Bearer {self._backend_token}"
            resp = await client.post(self._backend_url, json=record.to_dict(), headers=headers)
            resp.raise_for_status()
        except Exception:  # noqa: BLE001 -- delivery failures must never affect the voice loop
            logger.exception(
                "failed to deliver turn to backend tutor_turns endpoint "
                "(turn was already logged locally, so no data was lost)"
            )

    async def aclose(self) -> None:
        """Wait for any in-flight backend deliveries and close the HTTP client."""
        if self._pending:
            await asyncio.gather(*list(self._pending), return_exceptions=True)
        if self._client is not None:
            await self._client.aclose()
