"""Authorization policy that decides metadata capabilities before any text access."""

from .schemas import (
    AccessPolicy,
    DocumentMetadata,
    PermissionCapabilities,
    PermissionDecision,
    PersonaKind,
    PreviewState,
    User,
)

POLICY_VERSION = "dental-evidence-demo-v2"


def _capabilities(
    *,
    retrieve: bool,
    preview: bool,
    open_original: bool,
    requires_entitlement: bool = False,
) -> PermissionCapabilities:
    return PermissionCapabilities(
        can_retrieve=retrieve,
        can_preview=preview,
        can_open_original=open_original,
        requires_entitlement=requires_entitlement,
    )


def preview_state_for(decision: PermissionDecision) -> PreviewState:
    """Map capabilities to the frontend's content-safe preview state."""

    capabilities = decision.capabilities
    if capabilities.can_preview:
        return PreviewState.AVAILABLE
    if capabilities.requires_entitlement:
        return PreviewState.ENTITLEMENT_REQUIRED
    if capabilities.can_retrieve:
        return PreviewState.CITATION_ONLY
    return PreviewState.DENIED


class PermissionService:
    """Evaluate tenant, role, exclusion, and entitlement policy from metadata."""

    policy_version = POLICY_VERSION

    def decide(self, user: User, document: DocumentMetadata) -> PermissionDecision:
        if document.tenant_id != user.tenant_id:
            return self._decision(user, document, _capabilities(
                retrieve=False, preview=False, open_original=False
            ), "tenant_mismatch")

        if document.access_policy == AccessPolicy.EXCLUDED:
            return self._decision(user, document, _capabilities(
                retrieve=False, preview=False, open_original=False
            ), "excluded_by_policy")

        if (
            document.access_policy == AccessPolicy.PATIENT_RESTRICTED
            and user.persona != PersonaKind.DENTIST
        ):
            return self._decision(user, document, _capabilities(
                retrieve=False, preview=False, open_original=False
            ), "clinical_record_requires_dentist")

        entitlement = document.required_entitlement
        if (
            document.access_policy == AccessPolicy.ENTITLEMENT_CONTROLLED
            and entitlement not in user.entitlements
        ):
            return self._decision(user, document, _capabilities(
                retrieve=False,
                preview=False,
                open_original=False,
                requires_entitlement=True,
            ), f"missing_entitlement:{entitlement}")

        if document.access_policy == AccessPolicy.CITATION_ONLY:
            return self._decision(user, document, _capabilities(
                retrieve=True, preview=False, open_original=False
            ), "citation_only_source")

        if document.access_policy == AccessPolicy.LICENSED_INTERNAL:
            return self._decision(user, document, _capabilities(
                retrieve=True, preview=True, open_original=False
            ), "licensed_internal")

        return self._decision(user, document, _capabilities(
            retrieve=True, preview=True, open_original=True
        ), "allowed")

    def _decision(
        self,
        user: User,
        document: DocumentMetadata,
        capabilities: PermissionCapabilities,
        reason: str,
    ) -> PermissionDecision:
        return PermissionDecision(
            tenant_id=user.tenant_id,
            user_id=user.id,
            document_id=document.id,
            policy_version=self.policy_version,
            capabilities=capabilities,
            reason=reason,
        )
