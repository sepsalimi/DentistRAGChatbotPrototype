"""Grounded OpenAI generation from authorized documents or registry passages."""

import os

from openai import AsyncOpenAI

from .schemas import DocumentRecord


class LiveRagGenerator:
    """Generate only from documents already approved and ranked upstream."""

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self.api_key = api_key if api_key is not None else os.getenv("OPENAI_API_KEY")
        self.model = model or os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

    async def generate(self, question: str, documents: list[DocumentRecord]) -> tuple[str, bool]:
        if not documents:
            return "I could not find accessible evidence for that question.", True

        if not self.api_key:
            newest = documents[0]
            return (
                f"OpenAI is not configured. The most relevant accessible evidence is "
                f"“{newest.metadata.title}”: {newest.text}",
                True,
            )

        context = "\n\n".join(
            f"[{document.metadata.id}] {document.metadata.title}\n{document.text}"
            for document in documents
        )
        client = AsyncOpenAI(api_key=self.api_key)
        response = await client.responses.create(
            model=self.model,
            instructions=(
                "Answer the dental question using only the supplied authorized evidence. "
                "State uncertainty and source conflicts plainly. Do not provide a diagnosis."
            ),
            input=f"Question: {question}\n\nAuthorized evidence:\n{context}",
        )
        return response.output_text, False

    async def generate_from_passages(
        self,
        question: str,
        passages: list[tuple[str, str, str]],
    ) -> tuple[str, bool]:
        """Generate strictly from authorized registry passage quotations."""

        if not passages:
            return "I could not find accessible evidence for that question.", True
        if not self.api_key:
            return " ".join(passage[2] for passage in passages[:3]), True

        context = "\n\n".join(
            f"[{passage_id}] {title}\n{exact_quote}"
            for passage_id, title, exact_quote in passages
        )
        client = AsyncOpenAI(api_key=self.api_key)
        response = await client.responses.create(
            model=self.model,
            instructions=(
                "Answer only from the supplied authorized dental passages. "
                "Do not add unsupported facts or diagnosis. If evidence is insufficient, "
                "say so explicitly."
            ),
            input=f"Question: {question}\n\nAuthorized passages:\n{context}",
        )
        return response.output_text, False
