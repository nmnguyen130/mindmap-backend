# ===========================
# Stage 1: Build wheels
# ===========================
FROM python:3.13-slim AS builder

WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Build wheels (no extra dependencies needed - all pure Python or pre-built)
RUN pip install --upgrade pip && \
    pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# ===========================
# Stage 2: Production (minimal)
# ===========================
FROM python:3.13-slim AS production

# Install ONLY runtime dependencies needed by marker-pdf
# poppler-utils: PDF processing
# tesseract-ocr: OCR for marker-pdf
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1001 python && \
    useradd -r -u 1001 -g python python

WORKDIR /app

# Copy and install wheels
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/* && rm -rf /wheels

# Copy application
COPY --chown=python:python . .

# Environment
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER python

EXPOSE 5000

# Health check (using Python instead of wget)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health').read()"

# Start Gunicorn
CMD gunicorn --bind 0.0.0.0:5000 \
     --workers ${WEB_CONCURRENCY:-2} \
     --timeout 120 \
     --access-logfile - \
     --error-logfile - \
     app:app