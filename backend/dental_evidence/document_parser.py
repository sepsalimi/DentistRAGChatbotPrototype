"""Readable PDF and UTF-8 text parsing into precisely locatable source passages."""

from dataclasses import dataclass
from io import BytesIO
from uuid import uuid4

import pdfplumber
from pdfplumber.utils.exceptions import PdfminerException

from .source_registry import PassageRecord


class DocumentReadabilityError(ValueError):
    """Raised when an allowed upload contains no safely extractable text."""


@dataclass(frozen=True)
class ParsedDocument:
    """Extracted passages produced only after AI usage rights are approved."""

    passages: list[PassageRecord]


@dataclass(frozen=True)
class _PdfLine:
    """One geometrically grouped PDF text line."""

    text: str
    x0: float
    top: float
    x1: float
    bottom: float


def parse_document(content: bytes, media_type: str) -> ParsedDocument:
    """Parse one validated PDF or TXT upload without adding silent OCR fallbacks."""

    if media_type == "text/plain":
        return _parse_text(content)
    if media_type == "application/pdf":
        return _parse_pdf(content)
    raise ValueError(f"unsupported media type: {media_type}")


def _parse_text(content: bytes) -> ParsedDocument:
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as error:
        raise DocumentReadabilityError("TXT uploads must use UTF-8 encoding") from error

    if not text.strip():
        raise DocumentReadabilityError("TXT upload contains no readable text")

    passages: list[PassageRecord] = []
    cursor = 0
    for block in text.split("\n\n"):
        quote = block.strip()
        if not quote:
            cursor += len(block) + 2
            continue
        start = text.find(quote, cursor)
        end = start + len(quote)
        first_line = quote.splitlines()[0]
        section = first_line[:120] if len(quote.splitlines()) > 1 else None
        passages.append(
            PassageRecord(
                id=f"passage-{uuid4()}",
                source_id="pending",
                section=section,
                exact_quote=quote,
                start_offset=start,
                end_offset=end,
            )
        )
        cursor = end

    return ParsedDocument(passages=passages)


def _parse_pdf(content: bytes) -> ParsedDocument:
    if not content.startswith(b"%PDF-"):
        raise DocumentReadabilityError("PDF upload does not have a PDF header")

    passages: list[PassageRecord] = []
    document_offset = 0
    try:
        with pdfplumber.open(BytesIO(content)) as pdf:
            for page_number, page in enumerate(pdf.pages, start=1):
                words = page.extract_words()
                lines = _words_to_lines(words)
                for block_number, block in enumerate(
                    _lines_to_blocks(lines), start=1
                ):
                    quote = "\n".join(line.text for line in block)
                    bbox = [
                        min(line.x0 for line in block),
                        min(line.top for line in block),
                        max(line.x1 for line in block),
                        max(line.bottom for line in block),
                    ]
                    passages.append(
                        PassageRecord(
                            id=f"passage-{uuid4()}",
                            source_id="pending",
                            page_number=page_number,
                            section=f"Page {page_number}, block {block_number}",
                            exact_quote=quote,
                            start_offset=document_offset,
                            end_offset=document_offset + len(quote),
                            pdf_bbox=bbox,
                        )
                    )
                    document_offset += len(quote) + 2
    except PdfminerException as error:
        raise DocumentReadabilityError("PDF structure is not readable") from error

    if not passages:
        raise DocumentReadabilityError(
            "PDF contains no extractable text; scanned PDFs require explicit OCR"
        )
    return ParsedDocument(passages=passages)


def _words_to_lines(words: list[dict[str, object]]) -> list[_PdfLine]:
    """Group extracted words into visual lines using their top coordinates."""

    grouped: list[list[dict[str, object]]] = []
    for word in sorted(words, key=lambda item: (float(item["top"]), float(item["x0"]))):
        if (
            not grouped
            or abs(float(word["top"]) - float(grouped[-1][0]["top"])) > 3
        ):
            grouped.append([word])
        else:
            grouped[-1].append(word)
    return [
        _PdfLine(
            text=" ".join(str(word["text"]) for word in line),
            x0=min(float(word["x0"]) for word in line),
            top=min(float(word["top"]) for word in line),
            x1=max(float(word["x1"]) for word in line),
            bottom=max(float(word["bottom"]) for word in line),
        )
        for line in grouped
    ]


def _lines_to_blocks(lines: list[_PdfLine]) -> list[list[_PdfLine]]:
    """Split lines at visual paragraph gaps and retain block-local geometry."""

    blocks: list[list[_PdfLine]] = []
    for line in lines:
        if not blocks:
            blocks.append([line])
            continue
        previous = blocks[-1][-1]
        paragraph_gap = max(8.0, (previous.bottom - previous.top) * 0.75)
        if line.top - previous.bottom > paragraph_gap:
            blocks.append([line])
        else:
            blocks[-1].append(line)
    return blocks
