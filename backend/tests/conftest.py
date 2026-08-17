"""Shared pytest fixtures that reset the deterministic backend between tests."""

import pytest
from fastapi.testclient import TestClient

from dental_evidence.main import app, services


@pytest.fixture(autouse=True)
def reset_demo_state() -> None:
    """Keep content-read instrumentation and audit events isolated by test."""

    services.repository.reset()
    services.audit.clear()


@pytest.fixture
def client() -> TestClient:
    """Provide an in-process FastAPI client without starting a server."""

    return TestClient(app)
