"""Staff-role definitions and authorization rules for registered evidence sources."""

from enum import StrEnum
from typing import Protocol

from .schemas import PersonaKind, User


class StaffRole(StrEnum):
    """Supported dental-practice roles for source authorization."""

    STUDENT = "student"
    DENTIST = "dentist"
    HYGIENIST = "hygienist"
    RECEPTION = "reception"


class AuthorizableSource(Protocol):
    """Content-free source attributes used by the role policy."""

    tenant_id: str
    allowed_roles: set[StaffRole]
    required_entitlement: str | None
    patient_context_id: str | None


def staff_role_for(user: User) -> StaffRole:
    """Map demo identities, including the legacy front-desk persona, to staff roles."""

    if user.persona == PersonaKind.FRONT_DESK:
        return StaffRole.RECEPTION
    return StaffRole(user.persona.value)


def can_upload_sources(user: User) -> bool:
    """Allow clinical staff to register evidence while students and reception read."""

    return staff_role_for(user) in {StaffRole.DENTIST, StaffRole.HYGIENIST}


def authorize_source(
    user: User,
    source: AuthorizableSource,
    patient_context_id: str | None = None,
) -> tuple[bool, str]:
    """Authorize source access using tenant, role, entitlement, and patient context."""

    if source.tenant_id != user.tenant_id:
        return False, "tenant_mismatch"

    role = staff_role_for(user)
    if role not in source.allowed_roles:
        return False, "role_not_allowed"

    entitlement = source.required_entitlement
    if entitlement is not None and entitlement not in user.entitlements:
        return False, f"missing_entitlement:{entitlement}"

    source_patient = source.patient_context_id
    if source_patient is not None:
        if role not in {StaffRole.DENTIST, StaffRole.HYGIENIST}:
            return False, "clinical_context_not_allowed"
        if patient_context_id != source_patient:
            return False, "patient_context_mismatch"

    return True, "allowed"
