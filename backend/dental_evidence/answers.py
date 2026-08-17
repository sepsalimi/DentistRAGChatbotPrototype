"""Deterministic sample answers and grounded live-RAG answer assembly."""

from collections.abc import Sequence

from .live_rag import LiveRagGenerator
from .permissions import POLICY_VERSION, PermissionService, preview_state_for
from .schemas import (
    Answer,
    Citation,
    Claim,
    DocumentRecord,
    SourceDisagreement,
    User,
)


class AnswerService:
    """Resolve sample questions exactly and delegate unmatched questions."""

    def __init__(self, permissions: PermissionService, live_rag: LiveRagGenerator) -> None:
        self.permissions = permissions
        self.live_rag = live_rag

    async def answer(
        self,
        user: User,
        question: str,
        documents: list[DocumentRecord],
    ) -> Answer:
        normalized = " ".join(question.lower().split())
        by_id = {document.metadata.id: document for document in documents}

        if "tooth extraction" in normalized or "after an extraction" in normalized:
            return self._extraction_answer(user, by_id)
        if "maya" in normalized and ("medication" in normalized or "taking" in normalized):
            return self._patient_answer(user, by_id)
        if "emergency" in normalized and ("front desk" in normalized or "referral" in normalized):
            return self._emergency_answer(user, by_id)
        if "implant" in normalized and ("protocol" in normalized or "maintenance" in normalized):
            return self._implant_answer(user, by_id)
        if "dry socket" in normalized or "alveolar osteitis" in normalized:
            return self._dry_socket_answer(user, by_id)

        text, deterministic = await self.live_rag.generate(question, documents)
        citations = self._citations(user, documents[:3])
        return Answer(
            text=text,
            claims=[
                Claim(
                    id="claim-live-1",
                    text=text,
                    citation_ids=[citation.id for citation in citations],
                )
            ],
            citations=citations,
            deterministic=deterministic,
            policy_version=POLICY_VERSION,
        )

    def _extraction_answer(
        self, user: User, documents: dict[str, DocumentRecord]
    ) -> Answer:
        current = documents.get("doc-extraction-current")
        stale = documents.get("doc-extraction-stale")
        if current is None:
            return self._unavailable()

        selected = [current] + ([stale] if stale else [])
        citations = self._citations(user, selected)
        current_id = self._citation_id(current)
        claims = [
            Claim(
                id="claim-extraction-gauze",
                text="Keep gauze in place for 30 to 45 minutes.",
                citation_ids=[current_id],
            ),
            Claim(
                id="claim-extraction-rinse",
                text="Do not rinse for the first 24 hours.",
                citation_ids=[current_id],
            ),
            Claim(
                id="claim-extraction-smoking",
                text="Avoid smoking for 72 hours.",
                citation_ids=[current_id],
            ),
        ]
        disagreements = []
        if stale:
            disagreements.append(
                SourceDisagreement(
                    topic="Immediate rinsing and smoking avoidance duration",
                    preferred_citation_id=current_id,
                    conflicting_citation_id=self._citation_id(stale),
                    explanation=(
                        "The 2026 guidance is preferred over the 2019 archived handout; "
                        "the older source recommends immediate rinsing and only 24 hours "
                        "without smoking."
                    ),
                )
            )
        return Answer(
            text=(
                "Keep gauze in place for 30 to 45 minutes, do not rinse for 24 hours, "
                "and avoid smoking for 72 hours. The newer guidance supersedes a "
                "conflicting 2019 handout."
            ),
            claims=claims,
            citations=citations,
            disagreements=disagreements,
            deterministic=True,
            policy_version=POLICY_VERSION,
        )

    def _patient_answer(
        self, user: User, documents: dict[str, DocumentRecord]
    ) -> Answer:
        document = documents.get("doc-patient-maya")
        if document is None:
            return self._unavailable(
                "Your persona is not permitted to retrieve this patient clinical record."
            )
        citation = self._citation(user, document)
        text = (
            "The synthetic chart lists amoxicillin 500 mg three times daily and "
            "ibuprofen as needed."
        )
        return self._single_claim_answer(text, "claim-maya-medications", citation)

    def _emergency_answer(
        self, user: User, documents: dict[str, DocumentRecord]
    ) -> Answer:
        document = documents.get("doc-emergency-sop")
        if document is None:
            return self._unavailable()
        citation = self._citation(user, document)
        text = (
            "For uncontrolled bleeding, spreading facial swelling, breathing difficulty, "
            "or trauma, alert the dentist and arrange immediate emergency evaluation. "
            "Front desk staff should not give clinical advice."
        )
        return self._single_claim_answer(text, "claim-emergency-referral", citation)

    def _implant_answer(
        self, user: User, documents: dict[str, DocumentRecord]
    ) -> Answer:
        document = documents.get("doc-implant-licensed")
        if document is None:
            return self._unavailable(
                "The implant protocol requires an entitlement that this persona does not have."
            )
        citation = self._citation(user, document)
        text = (
            "At implant recall, assess peri-implant tissues and probing findings, "
            "reinforce plaque control, and obtain radiographs when clinically indicated."
        )
        return self._single_claim_answer(text, "claim-implant-maintenance", citation)

    def _dry_socket_answer(
        self, user: User, documents: dict[str, DocumentRecord]
    ) -> Answer:
        document = documents.get("doc-citation-only")
        if document is None:
            return self._unavailable()
        citation = self._citation(user, document)
        text = (
            "A systematic review reports that chlorhexidine interventions may reduce "
            "alveolar osteitis in selected extraction patients."
        )
        return self._single_claim_answer(text, "claim-dry-socket", citation)

    @staticmethod
    def _citation_id(document: DocumentRecord) -> str:
        return f"citation-{document.metadata.id}"

    def _citation(self, user: User, document: DocumentRecord) -> Citation:
        permission = self.permissions.decide(user, document.metadata)
        return Citation(
            id=self._citation_id(document),
            document_id=document.metadata.id,
            title=document.metadata.title,
            published_at=document.metadata.published_at,
            source_uri=(
                document.metadata.source_uri
                if permission.capabilities.can_open_original
                else None
            ),
            preview_state=preview_state_for(permission),
            access_policy=document.metadata.access_policy,
            capabilities=permission.capabilities,
        )

    def _citations(
        self, user: User, documents: Sequence[DocumentRecord]
    ) -> list[Citation]:
        return [self._citation(user, document) for document in documents]

    @staticmethod
    def _single_claim_answer(text: str, claim_id: str, citation: Citation) -> Answer:
        return Answer(
            text=text,
            claims=[Claim(id=claim_id, text=text, citation_ids=[citation.id])],
            citations=[citation],
            deterministic=True,
            policy_version=POLICY_VERSION,
        )

    @staticmethod
    def _unavailable(
        text: str = "I could not find accessible evidence for that question.",
    ) -> Answer:
        return Answer(
            text=text,
            claims=[],
            citations=[],
            deterministic=True,
            policy_version=POLICY_VERSION,
        )
