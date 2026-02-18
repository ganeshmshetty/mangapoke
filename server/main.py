from __future__ import annotations

import os
import re
import time
from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from .state import load_state, save_state


CHAPTER_RE = re.compile(r"([0-9]+(?:\.[0-9]+)?)")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

def get_manga_root() -> Path:
    env_root = os.environ.get("MANGA_ROOT")
    if env_root:
        return Path(env_root).expanduser().resolve()
    
    project_root = Path(__file__).resolve().parents[1]
    chapters_dir = project_root / "jjk"
    if chapters_dir.exists() and chapters_dir.is_dir():
        return chapters_dir
        
    return project_root


def chapter_sort_key(name: str) -> tuple:
    match = CHAPTER_RE.search(name)
    if match:
        try:
            return (0, float(match.group(1)), name)
        except ValueError:
            pass
    return (1, name, name)


def has_images(path: Path) -> bool:
    return any(
        f.suffix.lower() in IMAGE_EXTS for f in path.iterdir() if f.is_file()
    )


def list_chapters(root: Path) -> List[Path]:
    chapters = [
        p
        for p in root.iterdir()
        if p.is_dir() and not p.name.startswith(".") and has_images(p)
    ]
    return sorted(chapters, key=lambda p: chapter_sort_key(p.name))


def find_chapter(root: Path, chapter_id: str) -> Path | None:
    for chapter in list_chapters(root):
        if chapter.name == chapter_id:
            return chapter
    return None


def list_images(chapter_path: Path) -> List[Path]:
    images = [
        p
        for p in chapter_path.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS
    ]
    return sorted(images, key=lambda p: p.name)


app = FastAPI()
manga_root = get_manga_root()
state_path = manga_root / ".manga_viewer_state.json"

static_dir = Path(__file__).resolve().parents[1] / "web"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    index_path = static_dir / "index.html"
    return HTMLResponse(index_path.read_text(encoding="utf-8"))


@app.get("/api/chapters")
def get_chapters():
    chapters = []
    for chapter in list_chapters(manga_root):
        pages = list_images(chapter)
        title = chapter.name
        if title.lower().startswith("c"):
            title = title[1:]
        chapters.append(
            {
                "id": chapter.name,
                "title": title,
                "page_count": len(pages),
            }
        )
    return {"chapters": chapters}


@app.get("/api/chapters/{chapter_id}")
def get_chapter(chapter_id: str):
    chapter_path = find_chapter(manga_root, chapter_id)
    if chapter_path is None:
        raise HTTPException(status_code=404, detail="Chapter not found")

    pages = list_images(chapter_path)
    return {
        "id": chapter_id,
        "pages": [
            {
                "index": i + 1,
                "file": page.name,
                "url": f"/images/{chapter_id}/{page.name}",
            }
            for i, page in enumerate(pages)
        ],
    }


@app.get("/api/state")
def get_state():
    state = load_state(state_path)
    if state is None:
        return {"state": None}
    return {"state": state.__dict__}


@app.post("/api/state")
def post_state(payload: dict):
    payload = dict(payload)
    if "updated_at" not in payload:
        payload["updated_at"] = int(time.time() * 1000)
    state = save_state(state_path, payload)
    return {"state": state.__dict__}


@app.get("/images/{chapter_id}/{filename}")
def get_image(chapter_id: str, filename: str):
    chapter_path = find_chapter(manga_root, chapter_id)
    if chapter_path is None:
        raise HTTPException(status_code=404, detail="Chapter not found")

    image_path = chapter_path / filename
    if (
        not image_path.exists()
        or not image_path.is_file()
        or image_path.suffix.lower() not in IMAGE_EXTS
    ):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(image_path)
