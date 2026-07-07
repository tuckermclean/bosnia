# syntax=docker/dockerfile:1
#
# Ljiljan voice-agent — LiveKit Agents worker (Python), production image.
#
# Self-contained: unlike backend/Dockerfile, this one is built with
# `voice-agent/` itself as the build context (no monorepo root needed):
#
#   docker build -t ljiljan-voice-agent voice-agent
#
# (See .github/workflows/release.yml for how CI does this against GHCR, and
# voice-agent/.dockerignore for what's excluded from the build context.)
#
# Every module here is designed to be import-safe with zero environment
# variables set (see agent.py's module docstring) — config is only validated
# lazily inside entrypoint()/prewarm(). That's what makes this image buildable
# and startable without secrets baked in; real credentials are supplied at
# deploy time via the k8s Secret (see deploy/backend-secret.example.yaml and
# deploy/voice-agent-deployment.yaml).

FROM python:3.11-slim

WORKDIR /app

# Dependencies first for layer caching.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Worker source.
COPY *.py ./

# Runs as a non-root user.
RUN useradd --create-home --uid 1000 worker
USER worker

# No network port: this worker registers with the LiveKit server outbound
# and receives job dispatches over that connection — nothing to EXPOSE.
CMD ["python", "agent.py", "start"]
