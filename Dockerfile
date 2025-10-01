# syntax=docker/dockerfile:1

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VIRTUALENVS_CREATE=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential git \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md /app/

RUN pip install --upgrade pip \
    && pip install .

COPY src /app/src
COPY config /app/config
COPY scripts /app/scripts
COPY ops /app/ops

CMD ["python", "-m", "kalshi_autotrader.runner"]

