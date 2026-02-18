# GitHub Copilot Instructions

## Project Architecture
This is a local Manga Viewer application consisting of a Python FastAPI backend and a Vanilla JavaScript frontend.

- **Backend (`server/`)**: 
  - `main.py`: Core FastAPI application. Endpoints: `/api/chapters` (list), `/api/state` (sync progress), `/images/{path}` (serve content).
  - `state.py`: Persists reading progress (chapter, page, mode) to a JSON file (`.manga_viewer_state.json`) in the manga root.
  - **Data source**: Reads directories dynamically from a root folder (e.g., `jjk/`). 

- **Frontend (`web/`)**: 
  - **No Frameworks**: Pure HTML (`index.html`), CSS (`styles.css`), and JavaScript (`app.js`).
  - **Structure**: 
    - `api`: Wrapper for fetch calls.
    - `dom`: Cached DOM elements (populated in `init`).
    - `state`: Global application state object.

## Code Patterns & Conventions

### JavaScript (`web/app.js`)
- **State Management**: Modify the global `state` object directly (e.g., `state.zoomScale`, `state.mode`). Call explicit render/update functions after changes (e.g., `renderPages()`, `setZoom()`).
- **Zoom Implementation**: 
  - **Custom Logic**: Zoom is implemented via JS modifying CSS styles (width/height), *not* browser zoom.
  - **Modes**: 
    - `applySingleZoom()`: Handles single-page constraints and centering.
    - `applyVerticalZoom()`: Adjusts width of all images in the column.
  - **Critical**: When editing zoom logic, ensure `overflow` and Flexbox alignment (`align-items`) are toggled correctly. Centered flex layouts conflict with scrollable zoomed content.
- **UI Visibility**: Controlled via `toggleUIVisibility()`. Toggles `.ui-hidden` class on the root `.reader` element.

### CSS (`web/styles.css`)
- **Theming**: Use CSS variables (e.g., `--accent`, `--bg-primary`).
- **Layout**: Heavy use of CSS Grid (`.app`) and Flexbox.
- **Overrides**: The `.ui-hidden` state often requires `!important` to override specific element visibility or layout rules (e.g., forcing `height: 0` or `display: none`).

## Development & Workflows
- **Run Server**: `uvicorn server.main:app --reload` (requires `fastapi`, `uvicorn`).
- **Frontend Changes**: Edit `web/` files and refresh browser (no build step).
- **Shortcuts**: Defined in `app.js` (`window.addEventListener("keydown"...))`). Key shortcuts are `H` (hide UI), `M` (mode), `F` (fullscreen).

## Integration Points
- **State Sync**: Frontend syncs locally (`localStorage`) immediately and debounces server syncs (`POST /api/state`) to persist progress on restart.
