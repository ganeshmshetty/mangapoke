# ──────────────────────────────────────────────
#  MangaPoke — Self-hosted manga reader
# ──────────────────────────────────────────────
FROM python:3.13-slim AS base

# Prevent Python from writing .pyc files and enable unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# ── Install dependencies first (layer caching) ──
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy application code ──
COPY server/ ./server/
COPY web/ ./web/

# ── Create a default empty manga directory ──
RUN mkdir -p /manga

# ── Runtime config ──
# Users mount their manga library to /manga
ENV MANGA_ROOT=/manga

# Expose the web UI port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/mangas')" || exit 1

# Run the server
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
