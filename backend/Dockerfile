# Builds the persistent FastAPI source-registry and RAG service.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DENTAL_DATA_DIR=/data

WORKDIR /app

COPY pyproject.toml .
COPY dental_evidence dental_evidence

RUN python -m pip install --no-cache-dir . \
    && useradd --create-home appuser \
    && mkdir -p /data \
    && chown appuser:appuser /data

USER appuser

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "dental_evidence.main:app", "--host", "0.0.0.0", "--port", "8000"]
