"""Explicit retrieval mode, model, and persistent backend storage configuration."""

import os
from dataclasses import dataclass
from pathlib import Path

from .schemas import RetrievalMode


@dataclass(frozen=True)
class BackendSettings:
    """Validated mode settings; vector mode never falls back to offline retrieval."""

    retrieval_mode: RetrievalMode
    openai_api_key: str | None
    openai_model: str
    openai_embedding_model: str
    data_directory: Path

    @classmethod
    def from_environment(cls) -> "BackendSettings":
        mode_value = os.getenv("DENTAL_RAG_MODE", RetrievalMode.OFFLINE)
        choices = {item.value for item in RetrievalMode}
        if mode_value not in choices:
            choices = ", ".join(item.value for item in RetrievalMode)
            raise ValueError(
                f"DENTAL_RAG_MODE must be one of: {choices}"
            )
        mode = RetrievalMode(mode_value)

        api_key = os.getenv("OPENAI_API_KEY")
        if mode == RetrievalMode.VECTOR and not api_key:
            raise ValueError(
                "OPENAI_API_KEY is required when DENTAL_RAG_MODE=vector"
            )

        return cls(
            retrieval_mode=mode,
            openai_api_key=api_key,
            openai_model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
            openai_embedding_model=os.getenv(
                "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
            ),
            data_directory=Path(
                os.getenv(
                    "DENTAL_DATA_DIR",
                    str(Path(__file__).resolve().parent.parent / ".dental_data"),
                )
            ),
        )
