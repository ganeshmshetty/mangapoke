# Repository Guidelines

## Project Structure & Module Organization
- `server/`: FastAPI backend. `main.py` defines API routes and image serving; `state.py` persists reader state to `.manga_viewer_state.json` in the manga root.
- `web/`: Vanilla frontend (`index.html`, `styles.css`, `app.js`). No build step.
- `jjk/`: Manga content directories (e.g., `c181/`). Each chapter folder contains page images (`.jpg`, `.png`, `.webp`).
- Manga root resolution: set `MANGA_ROOT` to point at a different chapters directory; otherwise the app uses `./jjk/` if present.

## Build, Test, and Development Commands
- `uvicorn server.main:app --reload`: Run the API server and serve the frontend from `web/` (requires `fastapi`, `uvicorn`).
- No frontend build step; edit `web/*` and refresh the browser.

## Coding Style & Naming Conventions
- Python: 4-space indentation, type hints are used in `server/`.
- JavaScript/CSS/HTML: 2-space indentation, ES2020+ syntax, keep state in the global `state` object in `web/app.js`.
- Files: keep new endpoints in `server/main.py`; keep UI logic in `web/app.js` with clear sections (API, DOM, state).
- Lint/format: no tooling configured yet. If you introduce one, document it here and keep diffs minimal.

## Testing Guidelines
- No automated tests are present. If you add tests, document the runner here and follow the existing naming pattern (e.g., `test_*.py` for Python or `*.test.js` for JS).

## Commit & Pull Request Guidelines
- No Git history is available in this repo, so there are no established commit conventions.
- Suggested commit format: `type: short summary` (e.g., `feat: add chapter search`), keep commits focused.
- PRs: include a clear summary, list any manual test steps, and attach screenshots for UI changes.

## Architecture Overview
- Backend serves the frontend from `web/` and exposes JSON APIs: `GET /api/chapters`, `GET /api/chapters/{id}`, `GET /api/state`, `POST /api/state`, plus image routing under `/images/...`.
- Frontend loads chapter metadata, renders pages, and persists progress to both `localStorage` and the server (debounced).
- Keyboard shortcuts are handled in `web/app.js` (e.g., `H` hide UI, `M` mode toggle, `F` fullscreen).
## Configuration & Data Notes
- The reader saves progress to `.manga_viewer_state.json` in the manga root. This file is user data and should not be committed.
- Supported image extensions: `.jpg`, `.jpeg`, `.png`, `.webp`.
