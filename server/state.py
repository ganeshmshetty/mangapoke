from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict


@dataclass
class ReaderState:
    chapter_id: str
    page_index: int
    mode: str
    updated_at: int


def load_state(state_path: Path) -> ReaderState | None:
    if not state_path.exists():
        return None
    try:
        data = json.loads(state_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None

    if not isinstance(data, dict):
        return None

    try:
        return ReaderState(
            chapter_id=str(data.get("chapter_id", "")),
            page_index=int(data.get("page_index", 1)),
            mode=str(data.get("mode", "vertical")),
            updated_at=int(data.get("updated_at", 0)),
        )
    except (TypeError, ValueError):
        return None


def save_state(state_path: Path, payload: Dict[str, Any]) -> ReaderState:
    state = ReaderState(
        chapter_id=str(payload.get("chapter_id", "")),
        page_index=int(payload.get("page_index", 1)),
        mode=str(payload.get("mode", "vertical")),
        updated_at=int(payload.get("updated_at", 0)),
    )
    state_path.write_text(
        json.dumps(state.__dict__, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    return state
