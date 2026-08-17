# Dental Evidence Chat

A stakeholder-ready prototype for access-aware dental RAG. It combines a
ChatGPT-style experience with claim-level citations, source previews, persona
permissions, synthetic patient context, and a visible evidence trail.

The prototype contains no real patient data and is not clinical decision-making
software.

## What the demo shows

- Dentist and front-desk personas receive different answers and source access.
- Inline citations open an in-app evidence panel.
- "Why this answer" maps claims to sources, recency, conflicts, and unsupported
  statements without exposing private model reasoning.
- Source policies distinguish public, licensed in-app preview, citation-only,
  entitlement-controlled, patient-restricted, and fully excluded material.
- Excluded or unauthorized documents are filtered before their text is read,
  ranked, embedded, or sent to a model.
- Research mode shows a bounded evidence-review workflow.
- Source settings demonstrate Files, SharePoint, Google Drive, Open Dental, and
  synthetic patient-data connections.
- Deterministic showcase answers work without an API key; unmatched questions
  can use OpenAI with Qdrant-backed vector retrieval.

## Project structure

- `frontend/`: Next.js App Router and TypeScript interface.
- `backend/`: FastAPI, policy engine, deterministic fixtures, LlamaIndex,
  Qdrant local mode, OpenAI generation, and tests.
- `.env.example`: shared local configuration.

## Run locally

The frontend requires a current Node.js release. The backend requires Python
3.11 or newer.

### Backend

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[test]"
python -m uvicorn dental_evidence.main:app --reload
```

The API starts at `http://localhost:8000`. Interactive API documentation is at
`http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Retrieval modes

Runtime mode is explicit; the backend never silently changes retrieval modes.

### Offline stakeholder mode

```bash
export DENTAL_RAG_MODE=offline
```

This is the default. It uses authorization-first deterministic retrieval and
showcase answers without external services.

### Live vector RAG

```bash
export DENTAL_RAG_MODE=vector
export OPENAI_API_KEY=your_key
export OPENAI_MODEL=gpt-4.1-mini
export OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Vector mode uses LlamaIndex with an in-memory Qdrant collection. Policy produces
a user-specific allow-list before any document body is embedded, and Qdrant
queries also filter by tenant, user, and policy version.

## Suggested demo flow

1. Ask the first periodontal showcase question as the dentist.
2. Open an inline citation and show the source preview and evidence mapping.
3. Switch to the front-desk persona and point out the changed answer and
   excluded patient chart.
4. Open the access-impact section to compare permissions.
5. Demonstrate public, licensed-preview, citation-only, entitled, and excluded
   sources in the evidence panel.
6. Enable Research mode to show bounded access-filtered evidence review.
7. Visit Sources & settings and Audit activity.
8. With the backend running, enter a custom question to demonstrate streamed
   RAG and its authorization trace.

Useful backend showcase questions include:

- `What should we do after a tooth extraction?`
- `What medications is patient Maya taking?`
- `What is the front desk emergency referral SOP?`
- `What is the implant maintenance protocol?`
- `What does the evidence say about dry socket prevention?`

## Verification

```bash
cd backend
.venv/bin/python -m pytest -q
.venv/bin/python -m compileall -q dental_evidence tests
.venv/bin/python -m pip check

cd ../frontend
npm run typecheck
npm test
npm run build
```

## Production boundaries

This is intentionally a prototype. A production clinic deployment still needs
real identity-provider integration, source-of-truth ACL synchronization,
durable tenant isolation, encrypted storage, immutable audit retention, BAAs,
vendor security review, access revocation handling, and clinical governance.
The Open Dental, SharePoint, and Google Drive connections shown here are mocks;
they make no external calls and store no PHI.
