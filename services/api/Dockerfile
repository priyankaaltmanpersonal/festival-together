FROM python:3.11-slim AS base

WORKDIR /app

RUN pip install --no-cache-dir fastapi uvicorn pydantic-settings

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]


FROM base AS test

RUN pip install --no-cache-dir pytest httpx

COPY tests ./tests
COPY pyproject.toml ./pyproject.toml

ENV PYTHONPATH=/app

CMD ["pytest", "-q"]
