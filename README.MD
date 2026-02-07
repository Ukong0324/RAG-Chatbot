# RAG-Chatbot (PDF/TXT/MD) — LangChain + ChromaDB (TypeScript)

A minimal, research-friendly RAG (Retrieval-Augmented Generation) chatbot that ingests local documents (PDF/TXT/MD), stores embeddings in ChromaDB, and answers questions with citations.

This repository is intentionally CLI-first to keep the architecture transparent and easy to evaluate.

---

## Goals

Priority order:

1. Minimize hallucinations
2. Accuracy
3. Speed

Key design decisions:

- Strict evidence gating (score-based) to prevent generation when the retrieved context is likely irrelevant.
- Citations are printed in a deterministic format (`[filename p.N]` when available).
- Client-side embeddings (OpenAI) for portability across Windows and Ubuntu.

---

## Features

- Ingest documents from a directory:
  - `.pdf` (via LangChain PDFLoader)
  - `.txt`, `.md` (via TextLoader)
- Chunking with `RecursiveCharacterTextSplitter`
- Vector storage in **ChromaDB**
- Chat CLI:
  - Retrieval → evidence scoring → (pass) generation
  - (fail) hard refusal without calling the LLM
- Debug query CLI for inspecting retrieved chunks

---

## Repository Structure

```txt
src/
  cli/
    ingest.ts        # Load -> split -> embed -> upsert into Chroma
    debug-query.ts   # Inspect similarity search output quickly

  core/
    env.ts           # Zod-validated environment config
    loaders.ts       # DirectoryLoader + metadata normalization
    splitter.ts      # Chunking strategy
    vectorstore.ts   # Chroma vector store wiring
    chromaClient.ts  # ChromaClient wiring (admin ops / injection)
    metadata.ts      # Chroma-safe metadata sanitizer
    
chat.ts          # Chat loop with evidence gating + citations
```

---

## Requirements

- Node.js (recommended: 20+)
- Yarn (classic v1 is OK)
- A running ChromaDB server (default: `http://localhost:8000`)
- OpenAI API key for embeddings and chat generation

---

## Setup

### 1) Install dependencies

```bash
yarn install
```

### 2) Create `.env`

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=rag_docs
DATA_DIR=./data
RESET_COLLECTION=false
```

Notes:

- `DATA_DIR` should contain your `.pdf`, `.txt`, `.md` files.
- If you want ingestion to delete the collection before re-ingesting, set:
  - `RESET_COLLECTION=true`

---

## Run ChromaDB

You must have ChromaDB running before ingestion or chat.

Example (Docker):

```bash
docker run -p 8000:8000 chromadb/chroma
```

If you use a different host/port, update `CHROMA_URL` in `.env`.

---

## Usage

### 1) Put documents in `DATA_DIR`

Example:

```txt
data/
  attention is all you need.pdf
  notes.txt
  syllabus.md
```

### 2) Ingest

```bash
yarn ingest
```

Expected output includes:

- number of loaded documents
- number of chunks
- target Chroma collection name

### 3) Chat

```bash
yarn chat
```

Flow:

1. Retrieve top-K chunks from Chroma
2. Compute an evidence score (lexical overlap)
3. If evidence is insufficient:
   - refuse without calling the LLM
4. Otherwise:
   - generate an answer grounded in retrieved sources
   - print citations

### 4) Debug retrieval

```bash
yarn debug:query
```

This prints:

- number of retrieved chunks
- short snippets with citations

---

## Evidence Gating (Hallucination Control)

The chat CLI applies a conservative “evidence gate” before calling the LLM.

- It computes a lexical overlap score between the question tokens and the top retrieved chunks.
- If the score fails the thresholds, the system prints a fixed refusal message and stops.

Key constants (in `src/cli/chat.ts`):

- `MIN_OVERLAP_RATIO`
- `MIN_MATCHED_TOKENS`
- `TOP_SOURCES_FOR_SCORING`

Tuning guidance:

- If the bot refuses too often (false negatives):
  - lower `MIN_OVERLAP_RATIO`
  - or lower `MIN_MATCHED_TOKENS`
- If the bot answers irrelevant questions (false positives):
  - raise `MIN_OVERLAP_RATIO`
  - or raise `MIN_MATCHED_TOKENS`
  - reduce `TOP_SOURCES_FOR_SCORING` for stricter gating

---

## Citations Format

Citations are printed based on normalized metadata:

- With page number: `[filename p.N]`
- Without page number: `[filename]`

Metadata normalization happens in `src/core/loaders.ts`, and values are sanitized for Chroma in `src/core/metadata.ts`.

---

## Scripts

Common scripts:

```bash
yarn lint
yarn ingest
yarn chat
yarn debug:query
```

If `debug:query` is missing, ensure `package.json` includes:

```json
{
  "scripts": {
    "debug:query": "tsx src/cli/debug-query.ts"
  }
}
```

---

## Notes on Warnings

Depending on your dependency versions, you may see warnings from Chroma / LangChain related to:

- deprecated arguments
- missing server-side embedding configuration

This project uses client-side embeddings by design, so server-side embedding configuration is not required for correctness.
If you want completely clean console output, consider adding a small warning suppression layer in a CLI bootstrap (optional).

---

## License

MIT (or choose your preferred license).

---

## Contributing

PRs are welcome. If you change chunking, retrieval, or gating logic, please include:

- a short rationale
- a minimal eval set (even a small manual list of queries) showing the impact on:
  - hallucination rate
  - refusal rate
  - accuracy
