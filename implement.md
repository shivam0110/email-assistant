Here’s a practical, end-to-end plan you can follow to ship a **React + Node (Express)** app with **Clerk** auth, an **AI chat** that accepts user documents, and an **email draft** flow powered by **LangGraph/LangSmith** and **Composio**. Everything below assumes “in-memory” storage for simplicity in dev (you can swap in Redis/DB later).

---

# 0) What you’ll build (bird’s-eye view)

* **Frontend (React + Vite)**

  * Clerk for sign-in/up & user session
  * Chat UI with streaming responses
  * Document uploader (PDF, TXT, MD)
  * “Draft email” button → shows/editable email draft

* **Backend (Node + Express)**

  * Clerk middleware validates JWT on every API route
  * Upload endpoint → extract text → embed → store vectors in memory
  * Chat endpoint → LangGraph pipeline with retrieval (from in-memory vectors)
  * Draft-email endpoint → LangGraph node to format an email; optional Composio action for sending via user’s provider (keep it off by default; start with “draft only”)
  * LangSmith tracing on by default (opt-out via env)

* **AI/RAG plumbing**

  * Embeddings (OpenAI or your preferred provider)
  * In-memory vector store (simple JS arrays + cosine, or HNSWLib in LangChain JS)
  * LangGraph to orchestrate steps: route → retrieve → chat → (optionally) draft email
  * Composio to integrate with email providers if/when you move from “draft” to “send”

---

# 1) Tech choices & packages

**Frontend**

* `react`, `react-dom`, `vite`
* `@clerk/clerk-react`
* `react-query` (or `swr`) for API calls
* Optional: `react-dropzone` for file uploads; `react-hot-toast` for toasts

**Backend**

* `express`, `cors`, `morgan`
* `@clerk/clerk-sdk-node` (JWT verification)
* `multer` (file upload), `pdf-parse` (PDF text), or `pdfjs-dist` if needed
* `langchain`, `@langchain/openai` (or your chosen LLM/embeddings provider)
* `@langchain/community/vectorstores/hnswlib` (or a tiny custom in-mem store)
* `langgraph` (graph orchestration)
* `langsmith` (tracing/telemetry)
* `composio-core` (or the Composio SDK you intend to use)
* `eventsource`/SSE for streaming to front (or just chunked fetch)

---

# 2) Project structure

```
ai-email-assistant/
├─ apps/
│  ├─ web/                  # React + Vite
│  │  ├─ src/
│  │  │  ├─ main.tsx
│  │  │  ├─ App.tsx
│  │  │  ├─ components/
│  │  │  │  ├─ Chat.tsx
│  │  │  │  ├─ Message.tsx
│  │  │  │  ├─ DocumentUploader.tsx
│  │  │  │  └─ DraftEmailPreview.tsx
│  │  │  └─ lib/api.ts
│  │  └─ index.html
│  └─ api/                  # Node + Express
│     ├─ src/
│     │  ├─ server.ts
│     │  ├─ auth/clerk.ts
│     │  ├─ routes/chat.ts
│     │  ├─ routes/upload.ts
│     │  ├─ routes/draft.ts
│     │  ├─ ai/graph.ts     # LangGraph nodes & edges
│     │  ├─ ai/retrieval.ts # embeddings + vector store
│     │  ├─ ai/prompts.ts
│     │  └─ memory/store.ts # in-memory vector + per-user doc index
│     └─ env.d.ts
├─ .env                     # see env list below
├─ package.json             # or pnpm workspaces
└─ README.md
```

---

# 3) Environment variables

```
# Clerk
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# LLM provider (example: OpenAI)
OPENAI_API_KEY=...

# LangSmith (optional but recommended)
LANGSMITH_API_KEY=...
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT="ai-email-assistant-dev"

# Composio (optional for first phase)
COMPOSIO_API_KEY=...

# App
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
```

---

# 4) Auth wiring

**Frontend**
Wrap your app with `<ClerkProvider>` and gate routes with `<SignedIn/>` / `<SignedOut/>`. Use `useAuth()` to grab the session token and send it as `Authorization: Bearer <jwt>` to your backend.

**Backend**
Use Clerk’s Express middleware to verify tokens:

```ts
// apps/api/src/auth/clerk.ts
import { ClerkExpressRequireAuth } from "@clerk/clerk-sdk-node";
export const requireAuth = ClerkExpressRequireAuth();
```

Apply per route:

```ts
app.use("/api", requireAuth);
```

On the handler, pull the `userId` from `req.auth.userId` and use it as the partition key for your in-memory stores.

---

# 5) In-memory storage model

Keep it simple and **key by `userId`**:

```ts
// apps/api/src/memory/store.ts
type DocChunk = { id: string; text: string; embedding: number[]; meta: { docId: string; name: string } };
export const userVectors: Record<string, DocChunk[]> = {};    // userId -> chunks
export const userMessages: Record<string, {role:"user"|"assistant";content:string}[]> = {}; // chat history
```

For vector search, either:

* Use **LangChain’s HNSWLib** per user (easy, fast), or
* Start with a minimal cosine similarity over an array for clarity.

---

# 6) Document ingestion (upload → chunk → embed → index)

**API (Express)**
`POST /api/upload` (multipart). Steps:

1. Verify user from Clerk.
2. Accept files (e.g., `.pdf`, `.txt`, `.md`).
3. Extract text (`pdf-parse` for PDFs).
4. Chunk text (e.g., 800–1,200 tokens with 200 overlap).
5. Create embeddings (OpenAI `text-embedding-3-small` or similar).
6. Store in `userVectors[userId]`.

**Notes**

* Keep file size limits (e.g., 10–20 MB).
* Respond with `{ docId, chunks, chars }`.

---

# 7) LangGraph: the flow you want

Define a compact graph with these nodes:

1. **Router**

   * If user asks “draft an email …”, route to `DraftEmail` node.
   * Else route to `ChatWithRAG`.

2. **Retrieve**

   * Uses embeddings similarity against `userVectors[userId]` to fetch top-k (e.g., 5–8) chunks.

3. **ChatWithRAG**

   * System prompt: “You are an AI assistant. Use the provided context when relevant. If insufficient, say so briefly.”
   * Input: user message + retrieved context + short chat memory window (last 10 turns).
   * Output: streamed text.

4. **DraftEmail**

   * Prompt template with slots: `recipient`, `subject`, `tone` (formal/friendly), and `context` (retrieved chunks or the latest user message).
   * Output: `{ subject, body }`.

5. **(Optional) SendEmail via Composio**

   * Take `subject/body` → call Composio action for user’s provider (e.g., Gmail).
   * Start with **“disabled by default”** in dev; only return drafts to the UI.
   * When enabled, require explicit user confirmation and show the provider being used.

**Tracing**
Wrap LLM, retriever, and graph runners with LangSmith so you can see traces while debugging.

---

# 8) Backend endpoints (minimal contract)

* `POST /api/upload` → { docId, chunksCount }
* `POST /api/chat` (JSON: `{ message: string }`) → **SSE** stream of assistant tokens

  * The handler runs the graph path `Router → Retrieve → ChatWithRAG`
* `POST /api/draft` (JSON: `{ to?: string, subjectHint?: string, tone?: "formal"|"friendly"|"neutral", prompt: string }`)

  * Runs `Router → Retrieve → DraftEmail` and returns `{ subject, body }`
* `POST /api/send` (optional) → uses Composio to send the draft (explicit opt-in)

**SSE outline (server):**

```ts
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.flushHeaders();
// write: res.write(`data: ${JSON.stringify({ token })}\n\n`);
```

---

# 9) Frontend UI flow

* **Auth page**: Clerk’s prebuilt components are fine.
* **Main app** (protected):

  * **DocumentUploader**: file input → calls `/api/upload` → toast success
  * **Chat**:

    * Input box + “Attach docs?” hint
    * When you submit, open an `EventSource` to `/api/chat` and stream tokens into the last assistant message.
    * A “Draft email from this” button that opens a modal with options (to, subject hint, tone). Calls `/api/draft`.
  * **DraftEmailPreview**:

    * Show structured result `{subject, body}`
    * Buttons: “Copy”, “Insert into Gmail” (disabled until Composio ready), “Send via Composio” (when enabled → confirm)

**SSE on client (sketch):**

```ts
const es = new EventSource("/api/chat", { withCredentials: true });
es.onmessage = (e) => {
  const { token, done } = JSON.parse(e.data);
  appendTokenToUI(token);
  if (done) es.close();
};
```

---

# 10) Prompts (good starting points)

**Chat (RAG) system**

```
You are a helpful assistant. Use the context to answer. 
If context is insufficient, say so and ask a concise follow-up.
Cite snippets by short labels (e.g., [DocName p.2]) when they strongly inform an answer.
```

**Draft email system**

```
You write clear, concise emails. 
Given the user's intent and context, produce a professional draft.
Respect the requested tone. 
Output JSON strictly: { "subject": "...", "body": "..." }.
```

**Draft email user template**

```
Intent: {prompt}
Tone: {tone}
Optional recipient: {to}
Optional subject hint: {subjectHint}
Context (if any): 
{top_k_chunks_joined}
```

---

# 11) LangGraph skeleton (TS, conceptual)

```ts
// apps/api/src/ai/graph.ts
import { StateGraph } from "langgraph";
import { llm, embedder, retrieve } from "./retrieval";
import { chatPrompt, emailPrompt } from "./prompts";

type Input = { userId: string; message?: string; draft?: { to?: string; subjectHint?: string; tone?: string; prompt: string } };
type Output = { stream?: AsyncIterable<string>; draft?: { subject: string; body: string } };

const router = async (s: Input) => s.draft ? "draft" : "chat";

const retrieveNode = async (s: Input) => {
  const q = s.draft?.prompt ?? s.message ?? "";
  return await retrieve(s.userId, q); // returns top-k chunks
}

const chatNode = async (s: Input, ctx: any) => {
  const context = ctx.retrieved;
  return llm.stream(chatPrompt({ message: s.message!, context }));
}

const draftNode = async (s: Input, ctx: any) => {
  const context = ctx.retrieved;
  const { to, subjectHint, tone, prompt } = s.draft!;
  const res = await llm.call(emailPrompt({ to, subjectHint, tone, prompt, context }));
  return JSON.parse(res); // {subject, body}
};

export function buildGraph() {
  const g = new StateGraph<Input, Output>()
    .addNode("router", router)
    .addNode("retrieve", retrieveNode)
    .addNode("chat", chatNode)
    .addNode("draft", draftNode)
    .addEdge("router", "retrieve")
    .addConditionalEdges("router", { chat: "chat", draft: "draft" }); // conceptual

  return g.compile();
}
```

*(The real LangGraph API has specific builder semantics; the above is deliberately high-level to illustrate nodes/edges.)*

---

# 12) Composio integration (safe, opt-in)

* Start by **only returning the draft** (`/api/draft`).
* When enabling send:

  1. In settings, connect Composio with the user’s provider (OAuth). Store only the Composio connection ID in memory mapped to `userId`.
  2. `/api/send` receives `{ to, subject, body }`, looks up the user’s Composio connection, and calls the email action (e.g., Gmail: create draft or send).
  3. Always return the provider name + message ID + “view in provider” link.
  4. Require a **second explicit confirm** before sending (to prevent accidental sends).

---

# 13) Streaming, tokens, and memory

* **Chat memory**: keep **only the last N turns** in `userMessages[userId]` (e.g., 10–15) to bound context.
* **Token limits**: for long docs, retrieval beats stuffing. Use chunking + top-k (5–8).
* **Streaming**: prefer server-side SSE → client merges tokens.

---

# 14) Security & guardrails

* Validate MIME & size on upload. Strip binary.
* Sanitize filenames.
* Only compute embeddings server-side.
* On “send via Composio,” show a confirmation dialog with a full preview of **To**, **Subject**, **Body**.
* Log with LangSmith; exclude PII where possible.

---

# 15) Local dev quickstart

1. **Clerk**: create an app, grab publishable + secret keys, add [http://localhost:5173](http://localhost:5173) as allowed origin.
2. **Install**

```bash
# root
pnpm i
pnpm --filter @app/api dev   # starts on :4000
pnpm --filter @app/web dev   # starts on :5173
```

3. **Set env** files for both `web` (VITE\_) and `api`.
4. **Login via Clerk**, upload a sample PDF, ask a question, then click **Draft Email**.
5. Inspect traces in **LangSmith** to debug the graph.

---

# 16) Testing plan (tight feedback loop)

* Unit: chunker, embedder, cosine similarity, router logic.
* Integration: upload → embed → retrieve → chat.
* E2E: sign-in → upload → chat → draft → (optional) send via Composio sandbox.
* Regression: snapshot a few prompts/contexts and assert on stable sections of the email draft (subject format, greeting, sign-off).

---

# 17) Stretch ideas (when you outgrow in-memory)

* Swap in **Redis** or **SQLite** quickly (keep the retrieval interface the same).
* Add **message-level citations** (inline footnotes for each paragraph).
* Add **role presets** for drafts (“sales”, “support”, “exec summary”).
* Allow **doc collections** (project/workspace) per user.

---

## Minimal code stubs (to get you unblocked)

**Express server boot**

```ts
// apps/api/src/server.ts
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { requireAuth } from "./auth/clerk";
import chatRoutes from "./routes/chat";
import uploadRoutes from "./routes/upload";
import draftRoutes from "./routes/draft";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.use("/api", requireAuth, uploadRoutes);
app.use("/api", requireAuth, chatRoutes);
app.use("/api", requireAuth, draftRoutes);

app.listen(process.env.PORT || 4000, () =>
  console.log(`API on :${process.env.PORT || 4000}`)
);
```

**Upload route (sketch)**

```ts
// apps/api/src/routes/upload.ts
import { Router } from "express";
import multer from "multer";
import pdf from "pdf-parse";
import { embedAndIndex } from "../ai/retrieval";

const r = Router();
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } });

r.post("/upload", upload.single("file"), async (req, res) => {
  const userId = (req as any).auth.userId as string;
  if (!req.file) return res.status(400).json({ error: "No file" });

  const buf = req.file.buffer;
  const text = req.file.mimetype.includes("pdf") ? (await pdf(buf)).text : buf.toString("utf8");

  const { docId, chunks } = await embedAndIndex(userId, req.file.originalname, text);
  res.json({ docId, chunksCount: chunks.length });
});

export default r;
```

**Chat route (SSE, sketch)**

```ts
// apps/api/src/routes/chat.ts
import { Router } from "express";
import { runChatGraphStream } from "../ai/graph";

const r = Router();
r.post("/chat", async (req, res) => {
  const userId = (req as any).auth.userId as string;
  const { message } = req.body ?? {};
  if (!message) return res.status(400).json({ error: "message is required" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  for await (const token of runChatGraphStream({ userId, message })) {
    res.write(`data: ${JSON.stringify({ token })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default r;
```

**Draft route (returns JSON draft)**

```ts
// apps/api/src/routes/draft.ts
import { Router } from "express";
import { runDraftGraph } from "../ai/graph";

const r = Router();
r.post("/draft", async (req, res) => {
  const userId = (req as any).auth.userId as string;
  const { to, subjectHint, tone = "neutral", prompt } = req.body ?? {};
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  const draft = await runDraftGraph({ userId, draft: { to, subjectHint, tone, prompt } });
  res.json(draft); // {subject, body}
});

export default r;
```

---
