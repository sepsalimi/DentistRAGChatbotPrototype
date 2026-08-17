"""PHI-free in-memory audit recording for authorization and chat actions."""

from datetime import UTC, datetime
from uuid import uuid4

from .schemas import AuditEvent


class AuditLog:
    """Store events without questions, answers, patient names, or document text."""

    def __init__(self) -> None:
        self._events: list[AuditEvent] = []

    def record(
        self,
        *,
        tenant_id: str,
        user_id: str,
        action: str,
        outcome: str,
        document_id: str | None = None,
        result_count: int | None = None,
    ) -> AuditEvent:
        event = AuditEvent(
            id=str(uuid4()),
            occurred_at=datetime.now(UTC),
            tenant_id=tenant_id,
            user_id=user_id,
            action=action,
            outcome=outcome,
            document_id=document_id,
            result_count=result_count,
        )
        self._events.append(event)
        return event

    def list_for_tenant(self, tenant_id: str) -> list[AuditEvent]:
        return [event for event in self._events if event.tenant_id == tenant_id]

    def clear(self) -> None:
        self._events.clear()
