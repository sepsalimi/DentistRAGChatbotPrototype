"""Grounded answer assembly from authorized source-registry passage hits."""

from .live_rag import LiveRagGenerator
from .passage_index import PassageSearchResult
from .permissions import POLICY_VERSION
from .schemas import (
    Answer,
    Citation,
    Claim,
    PermissionCapabilities,
    PreviewState,
)


class RegistryAnswerService:
    """Generate answers and passage-locked citations from registry retrieval."""

    def __init__(self, generator: LiveRagGenerator) -> None:
        self.generator = generator

    async def answer(
        self,
        question: str,
        hits: list[PassageSearchResult],
    ) -> Answer:
        """Generate from exact quotes and map every claim to returned citations."""

        text, deterministic = await self.generator.generate_from_passages(
            question,
            [
                (
                    hit.citation.passage_id,
                    hit.citation.title,
                    hit.citation.exact_quote,
                )
                for hit in hits
            ],
        )
        citations = [self._citation(hit) for hit in hits]
        return Answer(
            text=text,
            claims=[
                Claim(
                    id="claim-registry-grounded",
                    text=text,
                    citation_ids=[citation.id for citation in citations],
                )
            ],
            citations=citations,
            deterministic=deterministic,
            policy_version=POLICY_VERSION,
        )

    @staticmethod
    def _citation(hit: PassageSearchResult) -> Citation:
        passage = hit.citation
        can_open = passage.source_access_action == "open_original"
        return Citation(
            id=f"citation-{passage.passage_id}",
            document_id=passage.source_id,
            passage_id=passage.passage_id,
            title=passage.title,
            published_at=passage.publication_date,
            effective_date=passage.effective_date,
            source_uri=passage.source_uri,
            preview_state=(
                PreviewState.AVAILABLE
                if can_open
                else PreviewState.CITATION_ONLY
            ),
            capabilities=PermissionCapabilities(
                can_retrieve=True,
                can_preview=can_open,
                can_open_original=can_open,
                requires_entitlement=False,
            ),
            publisher=passage.publisher,
            document_identity=passage.document_identity,
            edition=passage.edition,
            page_number=passage.page_number,
            section=passage.section,
            exact_quote=passage.exact_quote,
            start_offset=passage.start_offset,
            end_offset=passage.end_offset,
            pdf_bbox=passage.pdf_bbox,
            source_access_action=passage.source_access_action,
            source_access_url=passage.source_access_url,
            access_type=passage.access_type,
            media_type=passage.media_type,
        )
