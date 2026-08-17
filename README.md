# Dental Evidence Chat

Dental Evidence Chat is a working prototype for governed dental RAG. It answers
general questions for students, dentists, hygienists, and reception teams, with
optional patient context for authorized clinical roles.

The differentiator is the source layer: documents have stable identities,
explicit rights decisions, passage-level citations, and access-aware full
previews instead of becoming anonymous files in a vector database.

The prototype contains no real patient data and is not clinical
decision-making software.

## Product capabilities

- General dental chat across clinical care, prevention, education, coding, and
  practice workflow.
- Student, dentist, hygienist, and reception answer scopes.
- Optional synthetic patient context for dentists and hygienists.
- Real PDF/TXT upload with a rights decision before parsing or embedding.
- Persistent SQLite source registry and local approved-file storage.
- Lexical passage retrieval without an API key.
- Optional OpenAI generation and persistent Qdrant vector retrieval.
- Passage citations with publisher, document identity, edition, effective
  date, section, page, exact quote, offsets, and PDF bounding boxes.
- Full authorized TXT/PDF previews with the cited passage highlighted.
- Evidence trace showing scope, authorization, retrieval, ranking, exclusions,
  and claim-to-citation mapping without chain-of-thought.

## Source registry

Every source records:

- Publisher and stable document identity
- Edition, publication date, and effective date
- Supersedes/superseded-by relationships
- Applicability or jurisdiction
- Access type: public, internal, licensed, restricted, or user-provided
- AI usage rights: approved, unknown, or prohibited
- Hosting permission and separate passage-storage permission
- Allowed roles, required entitlement, and optional patient scope
- Ingestion status and current request capabilities

### Rights behavior

- Approved + hosting permitted: retain the original, parse passages, index,
  and allow authorized full-document preview.
- Approved + hosting not permitted + passage storage permitted: parse/index
  approved passages, discard the original, and link to the publisher.
- Approved + no storage permission: retain metadata only.
- Unknown: retain metadata for review; discard bytes; never parse or embed.
- Prohibited: retain safe prohibition metadata; discard bytes; never parse or
  embed.

Superseded and future-effective sources remain visible in registry history but
are excluded from normal retrieval.

## Run the working prototype

### Docker

Docker Compose persists registry metadata, approved originals, passages, and
Qdrant data in a named volume.

```bash
cp .env.example .env
docker compose up --build
```

Open:

- App: `http://localhost:3000`
- API documentation: `http://localhost:8000/docs`

Docker Desktop or an equivalent Compose runtime is required for this path.
This workspace did not have Docker installed, so the stack is also verified
through pytest, frontend tests, and the local FastAPI upload-to-citation flow.

Offline lexical mode is the default. To enable vector retrieval, set
`DENTAL_RAG_MODE=vector` and provide `OPENAI_API_KEY` in `.env`.

### Manual setup

Backend:

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test]"
python -m uvicorn dental_evidence.main:app --reload
```

Frontend:

```bash
cd frontend
bun install
bun run dev
```

## Try the complete workflow

1. Open Source Registry, then select Add source.
2. Choose a PDF or UTF-8 TXT file.
3. Enter publisher, document identity, edition, dates, applicability, and
   supersession metadata.
4. Set access type, AI usage rights, hosting permission, passage-storage
   permission, roles, entitlement, and optional patient scope.
5. Review the displayed rights decision before uploading.
6. Ask an arbitrary question using distinctive words from the approved source.
7. Open the citation to inspect its identity and rights metadata.
8. Open the full authorized document at the cited page and highlighted passage.

Use Unknown or Prohibited with a test file to demonstrate that only metadata is
registered and the content never enters storage or retrieval.

## Retrieval modes

Offline mode:

```bash
export DENTAL_RAG_MODE=offline
```

This performs deterministic authorization-first lexical passage retrieval and
works without external services.

Vector mode:

```bash
export DENTAL_RAG_MODE=vector
export OPENAI_API_KEY=your_key
export OPENAI_MODEL=gpt-4.1-mini
export OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Vector mode embeds approved passages into persistent local Qdrant, filters by
tenant, role, entitlement, effective version, and patient context, then
reauthorizes every search hit before generation.

## GitHub Pages

The static guided demo is available at:

https://sepsalimi.github.io/DentistRAGChatbotPrototype/

GitHub Pages demonstrates roles, sample answers, citations, source rights,
registry records, evidence traces, and preview behavior. Static hosting cannot
run FastAPI, persist uploads, or call private OpenAI credentials, so real
ingestion and arbitrary RAG questions require the local setup.

## Verification

```bash
cd backend
.venv/bin/python -m pytest -q
.venv/bin/python -m compileall -q dental_evidence tests
.venv/bin/python -m pip check

cd ../frontend
bun run typecheck
bun test
# Next.js 16's Bun wrapper can fail page-data collection; use Node 22.
node ./node_modules/next/dist/bin/next build
```

## Production boundaries

A production clinic deployment still needs real identity-provider
authentication, source-of-truth entitlement synchronization, encryption and
key management, malware scanning, immutable audit retention, backup and
deletion policies, BAAs, vendor review, and clinical governance. The current
roles and patient context are synthetic identities for demonstrating policy
behavior.
