# In-App Dynamic Chat Canvas — Research Findings

**Status:** Complete — consensus reached, awaiting human plan approval
**Date:** 2026-02-19
**Goal:** Design an in-app chat system per agent (replacing Discord) with multi-channel support and a dynamic artifact/canvas experience.

## Context

- **Spacebot** already has `CortexChatPanel` with per-agent, per-channel chat over SSE.
- **ai-chatbot** (`~/Projects/own/ai-chatbot`) implements an artifact/canvas system with pluggable artifact types (code, image, sheet, text) rendered in a side panel alongside chat.
- The user wants: per-agent chat, multiple channels per agent, dynamic canvas output (like ai-chatbot artifacts), and a plugin-friendly design.

## Hypotheses Under Investigation

| # | Agent | Hypothesis |
|---|-------|-----------|
| 1 | plugin-architect | Build as a first-class **plugin** in spacebot's plugin system |
| 2 | tauri-native | Leverage **Tauri native windows** for multi-channel panels |
| 3 | artifact-porter | **Port ai-chatbot's artifact/canvas pattern** into the interface |
| 4 | spa-evolutionist | **Evolve** the existing `CortexChatPanel` + `ChannelDetail` routes |
| 5 | devils-advocate | Challenge every assumption; force clarity |

## Debate Transcript

*(Agents append findings here as they debate)*

### Tauri Native — Initial Hypothesis

**Agent:** tauri-native
**Position:** Tauri native windows are NOT the right primary architecture for multi-channel chat panels. The SPA approach with artifact canvas should be the core, with Tauri providing lightweight integration points.

#### Evidence from the Codebase

1. **Minimal Tauri usage today.** The Tauri setup in `src-tauri/src/main.rs` is a thin shell: it spawns the spacebot server in a background thread and renders a single webview pointing at `http://localhost:19898`. There are zero Tauri commands (`#[tauri::command]`), zero IPC calls, zero window management APIs. The `Cargo.toml` dependencies confirm this — only `tauri` base + `tauri-plugin-shell`, no window management plugins.

2. **Single window config.** `tauri.conf.json` defines exactly one window at 1200x800 pointing to the HTTP server. The app is architecturally a web app wrapped in a native frame.

3. **All state lives in the HTTP/SSE layer.** The `ApiState` struct manages agent events, channel states, SSE broadcast (`event_tx`), cortex chat sessions — all accessible via REST/SSE. The frontend (`CortexChatPanel`, `ChannelDetail`) consumes these over HTTP fetch + SSE. There is no Tauri IPC channel for any of this.

4. **Frontend is a full SPA.** Routes like `AgentChannels`, `ChannelDetail`, `AgentCortex` etc. are TanStack Router routes in a single-page React app. The `ChannelDetail` component already supports a side-panel pattern (cortex chat slides in at 400px width via framer-motion animation).

#### Why Multi-Window Tauri Is Wrong Here

- **State synchronization nightmare.** Each Tauri `WebviewWindow` runs an independent webview with its own JS context. Sharing reactive state (SSE streams, React context, TanStack Router state) across windows requires either:
  - Tauri IPC bridge (would need to build from scratch — currently zero IPC exists)
  - `BroadcastChannel` / `SharedWorker` (fragile, limited to same-origin, no shared React tree)
  - Duplicated SSE connections per window (wasteful, race conditions on state)

- **No existing IPC foundation.** Building proper Tauri commands for chat would mean duplicating the entire HTTP API as `#[tauri::command]` handlers. The HTTP API already works well and supports both the Tauri webview AND any external client (browser, mobile app in future).

- **UX regression for multi-panel.** Users want to see chat + artifact canvas side-by-side within the same view. Separate OS windows mean separate window management, z-ordering issues, and no shared layout animations (like the smooth framer-motion slide in `ChannelDetail`).

- **Cross-platform inconsistency.** Tauri v2 multi-window behavior varies across macOS/Windows/Linux. The SPA approach renders identically everywhere.

#### Where Tauri Native DOES Add Value

Tauri should be used for what it does best — native OS integration that web can't do:

1. **System tray / menu bar** — notification badges, quick-switch between agents
2. **Native notifications** — `tauri-plugin-notification` for incoming messages when app is backgrounded
3. **Deep links** — `spacebot://agent/cortex/channel/123` to jump to a specific chat
4. **File drag-and-drop** — native file handling for artifact attachments
5. **Global keyboard shortcuts** — quick-open chat overlay from anywhere

These are thin integration points that complement the SPA, not replace it.

#### Recommended Architecture

The chat canvas should be built as **SPA panels within the single webview**, following the pattern already established by `ChannelDetail` (main content + sliding side panel). Artifacts should follow ai-chatbot's model of pluggable artifact types rendered inline. Tauri provides the native shell and OS-level integrations listed above.

This is essentially an endorsement of a hybrid of the **SPA Evolutionist** and **Artifact Porter** approaches, with Tauri as a complementary native layer rather than the primary architecture.

### SPA Evolutionist — Initial Hypothesis

**Agent:** spa-evolutionist
**Position:** The existing `CortexChatPanel` + `ChannelDetail` architecture is 80% of the way to a dynamic canvas chat. We should **evolve it incrementally** rather than rewrite, port, or re-architect.

#### What Already Exists (and Works)

The codebase has a surprisingly complete foundation:

1. **Per-agent, per-channel chat is done.** `ChannelDetail` renders a full timeline (messages, branch runs, worker runs) with live SSE updates via `useChannelLiveState`. The `AgentChannels` route lists all channels per agent with search/filtering. The router already has `/agents/$agentId/channels/$channelId` — this IS the multi-channel chat.

2. **Side-panel pattern is established.** `ChannelDetail` (line 364-382) already slides a `CortexChatPanel` in/out at 400px width using `framer-motion` `AnimatePresence`. This is exactly the layout pattern ai-chatbot uses for its artifact panel (chat on left, artifact on right).

3. **SSE real-time infrastructure is production-grade.** `useEventSource` handles exponential backoff, reconnection, lag recovery. `useChannelLiveState` manages timeline merging, status snapshots, infinite scroll pagination. This is non-trivial code that works today.

4. **Cortex chat is a separate thread system.** `useCortexChat` manages independent threads with SSE streaming, tool activity tracking, and message persistence. It can be given `channelId` context — meaning it already knows about the channel it's contextually attached to.

5. **Rich timeline items.** The timeline isn't just messages — it renders `branch_run` and `worker_run` items with live tool activity indicators, expandable conclusions/results. These ARE artifacts in spirit — structured output rendered alongside chat.

#### The Gap: What's Missing for Canvas/Artifacts

The delta between current state and "dynamic canvas chat" is small:

| Feature | Current State | What to Add |
|---------|--------------|-------------|
| Artifact rendering | Branch/worker conclusions render as expandable Markdown | Add typed artifact renderers (code with syntax highlighting, tables, images) |
| Artifact panel layout | Cortex panel slides in at fixed 400px | Make it a general-purpose right panel that can render any artifact type |
| Artifact data model | `TimelineItem` has `branch_run.conclusion` and `worker_run.result` as strings | Extend `TimelineItem` with an optional `artifact` field: `{ kind, title, content }` |
| Canvas interaction | Read-only view | Add edit capability per artifact type (code editor, text editor) |
| Artifact persistence | Conclusions/results stored in channel messages DB | Add a lightweight `artifacts` table or embed in existing message storage |

#### Proposed Evolution Path (4 Steps)

**Step 1: Extend TimelineItem with artifact metadata**
Add an optional `artifact` field to `TimelineMessage` on the Rust side:
```
artifact: Option<{ kind: String, title: String, content: String }>
```
The frontend's `TimelineEntry` component gets a new case for rendering artifacts. No new routes, no new hooks, no new SSE events needed.

**Step 2: Replace fixed CortexChatPanel slot with generic ArtifactPanel**
Rename/refactor the right-side sliding panel in `ChannelDetail` from "cortex chat only" to "contextual panel" that can render:
- Cortex chat (existing)
- An expanded artifact (code viewer, image, table)
- A tool activity detail view

This is ~50 lines of change in `ChannelDetail.tsx` — swap the `CortexChatPanel` for a `<ContextPanel kind={panelKind} data={panelData} />` wrapper.

**Step 3: Add artifact type renderers**
Create a registry pattern like ai-chatbot's `artifactDefinitions` array:
```typescript
const artifactRenderers = { code: CodeArtifact, text: TextArtifact, image: ImageArtifact };
```
Each renderer is a React component. Start with 2: `code` (Monaco/CodeMirror) and `text` (Markdown). Add more as needed.

**Step 4: Wire artifact creation into bot responses**
When the bot (branch/worker) produces structured output, tag it with artifact metadata. The SSE events already carry `conclusion` and `result` — extend them with artifact kind/title.

#### Why This Beats the Alternatives

**vs. Plugin Architecture:** Spacebot doesn't have a frontend plugin system today. Building one for this single feature is over-engineering. The chat UI is core functionality, not a plugin. If we need plugins later, we can extract it then.

**vs. Tauri Native Windows:** tauri-native agent's own analysis agrees — Tauri multi-window is wrong for this. The SPA side-panel pattern already works.

**vs. Porting ai-chatbot:** ai-chatbot's artifact system is built on Next.js with SWR, server components, database documents with versioning, and a complex `useSWR("artifact")` global state hack. Porting it would mean:
- Ripping out SWR patterns and replacing with our TanStack Query + SSE approach
- Reimplementing the document/versioning model (we don't need versioning — our artifacts are bot output, not user-edited documents)
- Fighting the Next.js assumptions baked into every component

The *concepts* from ai-chatbot are valuable (artifact type registry, side-panel layout, inline artifact references), but the *code* is not portable. We should steal the ideas and implement them natively in our existing architecture.

#### Risk Assessment

- **Low risk:** Steps 1-2 are backward-compatible. Existing UI works unchanged. New artifact rendering is additive.
- **Reversible:** Each step is a small, independent PR. If step 3's artifact renderers don't work out, steps 1-2 still improve the codebase.
- **YAGNI-compliant:** We don't build versioning, document persistence, or edit capabilities until proven needed. Start read-only.

#### Files That Change

- `src/api/client.ts` — add `artifact` field to `TimelineMessage` type
- `interface/src/routes/ChannelDetail.tsx` — generalize right panel
- `interface/src/components/CortexChatPanel.tsx` — no changes needed initially
- New: `interface/src/components/ArtifactPanel.tsx` (~100 lines)
- New: `interface/src/components/artifacts/CodeArtifact.tsx` (~50 lines)
- New: `interface/src/components/artifacts/TextArtifact.tsx` (~30 lines)
- Rust: `src/api/channels.rs` — extend message response with artifact field

Total estimated delta: ~300 lines of new code, ~50 lines of modified code.

### Plugin Architect — Initial Hypothesis

**Agent:** plugin-architect
**Position:** The dynamic chat canvas with artifact rendering should be designed around spacebot's **plugin contract** — not necessarily shipped as an iframe-isolated plugin today, but architected so that artifact types are pluggable modules following the same extension model as the existing plugin system.

#### Evidence from the Codebase

1. **The plugin system already supports full-stack plugins.** `PLUGIN.toml` (`src/plugins.rs:17-27`) declares three capabilities: `[ui]` (static SPA or dev-server proxy), `[api]` (managed subprocess with health checks), and `[[tools]]` (LLM-facing tools via `PluginTool` in `src/tools/plugin_tool.rs`). A canvas artifact type could use all three: UI component for rendering, API for processing, tools for the LLM to create/update artifacts.

2. **Plugin subprocess management is production-grade.** `PluginProcess` in `src/plugins/process.rs` handles auto-port assignment, health polling (30 attempts at 500ms), graceful shutdown, and kill-on-drop. An artifact backend (e.g., code execution sandbox, image generation) would get this lifecycle management for free.

3. **Plugin tools integrate directly with the LLM.** `PluginTool` registers tools as `plugin_{plugin}_{tool}` with JSON Schema, subprocess execution via stdin/stdout, and 60s timeout. An artifact plugin could register `create_artifact`, `update_content` tools that the LLM invokes during chat.

4. **Two-tier loading enables per-agent customization.** `PluginSet::load()` loads from `{instance_dir}/plugins/` and `{workspace}/plugins/`, with workspace overriding instance. Different agents could have different artifact capabilities.

5. **ai-chatbot's artifact system IS a plugin system.** The `Artifact` class in `ai-chatbot/components/create-artifact.tsx` is effectively a plugin contract: `kind`, `description`, `content` (React component), `actions`, `toolbar`, `initialize`, `onStreamPart`. The four artifact types (code, text, image, sheet in `artifacts/`) are self-contained modules registered in an array (`artifactDefinitions`). This is a plugin registry pattern.

#### The Key Insight: Plugin Contract != Plugin Isolation

I want to be precise about what "plugin architecture" means here. I am NOT arguing for:
- Iframe-isolated artifact renderers (too much overhead for tightly-integrated UI)
- Separate subprocesses per artifact type (unnecessary for frontend components)
- The current `PluginView.tsx` pattern (full-page iframe is wrong for panels)

I AM arguing for:
- **A formal artifact type contract** modeled on both ai-chatbot's `ArtifactConfig<T, M>` and spacebot's `PLUGIN.toml` manifest
- **A registry pattern** where artifact types are discovered and loaded dynamically
- **Separation of artifact rendering from chat infrastructure** so new types can be added without touching `ChannelDetail.tsx`

#### Proposed Architecture: Artifact Type Registry

```typescript
// Modeled after ai-chatbot's Artifact class + spacebot's PLUGIN.toml concepts
interface ArtifactType<K extends string, M = any> {
  kind: K;                          // "code" | "text" | "image" | "sheet"
  description: string;              // For LLM tool descriptions
  component: ComponentType<ArtifactContentProps<M>>;  // Render component
  actions: ArtifactAction<M>[];     // Per-artifact actions (copy, run, etc.)
  toolSchema: JsonSchema;           // Schema for LLM tool args
  onStreamDelta?: (delta: string, setArtifact: SetState) => void;
  initialize?: (ctx: InitContext<M>) => void;
}

// Registry loaded at startup
const artifactRegistry = new Map<string, ArtifactType>();
artifactRegistry.set("code", codeArtifact);
artifactRegistry.set("text", textArtifact);
// Future: load from plugin directories
```

This gives us:
- **SPA Evolutionist's pragmatism** — artifact renderers are React components in the main bundle, no iframes, no isolation overhead
- **Plugin system's extensibility** — the contract is formal, new types can be added as npm packages or (later) loaded from plugin directories
- **ai-chatbot's proven pattern** — the `Artifact` class pattern works; we adapt it to our SSE/TanStack infrastructure

#### Where the Plugin System Grows Later

Phase 1 (now): Artifact types are compiled-in React modules following the `ArtifactType` contract. Ship fast.

Phase 2 (when needed): Extend `PLUGIN.toml` with an `[[artifacts]]` section:
```toml
[[artifacts]]
kind = "3d-model"
description = "Render and interact with 3D models"
component = "ui/artifacts/3d-model.js"  # Loaded dynamically
tool_schema = "schemas/3d-model.json"
```
The plugin system already handles discovery, loading, and tool registration. Adding artifact type discovery is incremental.

#### Where I Agree with SPA Evolutionist

The spa-evolutionist's 4-step plan is correct for the CHAT side: extend `TimelineItem`, generalize the right panel, wire artifact creation into bot responses. My argument is about HOW the artifact renderers are structured — as a formal registry with a plugin-compatible contract, not ad-hoc components scattered through the codebase.

#### Where I Disagree with SPA Evolutionist

The spa-evolutionist says "building a plugin system for this single feature is over-engineering." I disagree:

1. **It is not a single feature.** Artifact types are inherently plural and growing. Code, text, image, sheet are just the start. Each agent workspace may need different types.

2. **The contract exists anyway.** Any artifact renderer needs props like `content`, `onSave`, `metadata`, `status`. Whether you call it an "interface" or a "plugin contract," you are defining one. I am saying: define it intentionally, matching the patterns already proven in both ai-chatbot and the spacebot plugin system.

3. **The cost is near-zero.** A TypeScript interface + a Map registry is ~20 lines. It is not over-engineering; it is organizing your code.

#### Risk Assessment

- **Low complexity:** The artifact type contract is a TypeScript interface + registry map. No new infrastructure.
- **Compatible:** Works with SPA evolutionist's plan for extending `ChannelDetail` and `TimelineItem`.
- **Migration-friendly:** When/if we need external plugin artifact types, the contract is already defined.

### Devil's Advocate — Initial Challenges

**Agent:** devils-advocate
**Role:** Ruthless challenger. Every hypothesis gets stress-tested against the actual codebase.

---

#### Challenge 1: Plugin Architect — "Artifact Type Registry"

**Verdict: Substantially revised from initial position. Now much stronger.**

The plugin-architect wisely abandoned "build as a plugin subprocess" and instead advocates for a formal `ArtifactType` interface + registry. This is a good position. My remaining challenges:

1. **The `ArtifactType` interface is heavier than needed for v1.** The proposed interface includes `toolSchema`, `onStreamDelta`, `initialize`, `actions` — all modeled on ai-chatbot's full artifact system. For v1, we need `kind`, `component`, and maybe `description`. Start minimal. The interface can grow.

2. **"Phase 2: extend PLUGIN.toml with `[[artifacts]]`"** — this is speculative future work. Don't let it influence current design. Design for today's requirements with clean extension points, not for a hypothetical plugin marketplace.

3. **Plugin-architect and SPA-evolutionist are 90% aligned.** The disagreement is about 20 lines of code (interface definition + registry map). This is a style discussion, not an architectural one. Both agree: React components in the main bundle, no iframes, no subprocess isolation.

**Questions answered:** Plugin-architect correctly conceded that the subprocess plugin system has no UI injection. The revised position (artifact type contract as a TypeScript interface) is sound.

---

#### Challenge 2: Tauri Native — Self-Corrected

**Verdict: Correctly self-defeated. Position accepted.**

Tauri-native's analysis is honest and thorough. They correctly identified that:
- The Tauri layer is a thin webview shell (zero IPC)
- Multi-window state sync would be built from scratch
- The SPA side-panel pattern already works

Their "complementary Tauri integrations" (tray, notifications, deep links) are nice-to-haves and should be scoped separately. Not part of this feature.

**Remaining push:** Don't scope-creep Tauri integrations into the chat canvas work. Those are separate PRs, separate priorities.

---

#### Challenge 3: Artifact Porter — Still awaiting full response

**Questions outstanding:**
1. What specific files/functions from ai-chatbot are literally portable vs. must be rewritten?
2. How does spacebot's SSE protocol map to ai-chatbot's streaming expectations?
3. What replaces SWR for artifact state management?

**Preliminary assessment from reading ai-chatbot directly:**

The code is NOT portable. The concepts ARE:
- **Portable concept:** Artifact type registry (`artifactDefinitions` array with `kind`, `content` component, `initialize`)
- **Portable concept:** Side-panel layout (chat left, artifact right, 400px width)
- **Portable concept:** Artifact metadata shape (`kind`, `title`, `content`, `status`)
- **Not portable:** SWR global state singleton (`useSWR("artifact")`)
- **Not portable:** Document versioning API (`/api/document?id=...`)
- **Not portable:** `PureArtifact` component (500+ lines coupled to Next.js patterns)
- **Not portable:** Animation model (bounding box transitions, full-screen overlay)

---

#### Challenge 4: SPA Evolutionist — Strongest but underscoped

**Verdict: Right direction, needs honest scoping.**

**Objection 1: "~300 lines of new code" is fiction.** The plan omits:
- Rust backend changes to produce artifact metadata in `TimelineItem` (channel event loop, SSE serialization, database schema)
- State management for artifact selection (which artifact is open in the right panel)
- The actual artifact renderers — a code artifact with syntax highlighting is a heavyweight dependency (CodeMirror or Monaco)
- New SSE event types if we want streaming artifact content

**Objection 2: "Extend TimelineItem with artifact field" conflates timeline events and artifacts.** An artifact isn't just a timeline entry — it may be referenced from multiple messages, viewed independently, and persisted separately. Bolting `artifact: Option<{...}>` onto `TimelineMessage` works for v1 read-only but creates the wrong data model for:
- "Show all artifacts from this agent"
- "Open artifact in expanded view"
- Future editing/updating

Consider a separate `artifacts` table from the start, referenced by ID from timeline items.

**Objection 3: Backend protocol changes are unavoidable.** The claim "No new SSE events needed" in Step 1 is only true if artifacts are delivered as complete objects in the `done` event. For streaming artifact content (like ai-chatbot's progressive code generation), you need `artifact_stream_delta` events. This is a backend change in the Rust server.

**Despite these objections, the 4-step evolution plan is the correct approach.** It just needs:
1. Honest scope: this is not 300 lines. Estimate 800-1200 with Rust backend changes.
2. Artifact data model: separate artifacts table, not just a field on messages.
3. Backend protocol: plan for new SSE event types even if v1 delivers complete artifacts.

---

#### Cross-Cutting Observations

**The backend is the elephant in the room.** Every hypothesis focuses on frontend architecture, but the Rust backend needs to:
1. Produce artifact metadata when bot output is structured
2. (Eventually) stream artifact content incrementally via SSE
3. Persist artifacts so they survive page reloads
4. Expose artifact query endpoints for the frontend

None of the four hypotheses have fully addressed this.

**The "replacing Discord" framing is misleading.** The codebase already has multi-channel chat via `ChannelDetail` + `ChannelList`. The real feature request is: "add a canvas/artifact panel to the existing chat." This is a feature addition, not an architecture replacement.

**Simplicity should win.** The user said "practical and buildable, not over-engineered." The emerging consensus is clear.

---

### Devil's Advocate — Emerging Synthesis

The debate is converging. Here's where each agent stands:

| Agent | Original Position | Revised Position | Status |
|-------|------------------|-----------------|--------|
| tauri-native | Tauri native windows | SPA + Tauri garnish | **Conceded** — endorses SPA evolution |
| plugin-architect | Build as plugin | Artifact type registry contract | **Revised** — now compatible with SPA evolution |
| spa-evolutionist | Evolve CortexChatPanel | 4-step incremental plan | **Core proposal** — needs backend scoping |
| artifact-porter | Port ai-chatbot | (awaiting full response) | **Expected:** concepts portable, code not |

**Direction of consensus:** SPA evolution (spa-evolutionist's 4-step plan) + formal artifact type registry (plugin-architect's contract) + design inspiration from ai-chatbot (artifact-porter's concepts). Tauri native stays as the shell it already is.

I am waiting for artifact-porter's response and for spa-evolutionist to address my backend protocol objections before writing the final consensus.

### SPA Evolutionist — Revised Position (Post-Debate)

**Agent:** spa-evolutionist
**Status:** Concessions made, position refined after challenges from all agents.

#### Concessions

1. **Scope:** ~300 lines was fiction. Honest estimate: **800-1200 lines** full-stack (Rust + TypeScript). Accepted.
2. **Data model:** Separate `artifacts` table, not inline on TimelineMessage. Devil's advocate was right. Accepted.
3. **Artifact type contract:** Port `create-artifact.tsx` from ai-chatbot verbatim (~93 lines, zero framework deps). Artifact-porter was right that this IS portable. Supersedes my slim interface proposal. Accepted.
4. **SSE protocol:** Design 4 event types upfront (`artifact_open`, `artifact_delta`, `artifact_clear`, `artifact_finish`), even though v1 ships complete artifacts only. Artifact-porter's mapping is clean. Accepted.
5. **Portability claim retracted:** My "none of the code is portable" was wrong. ~30% of frontend artifact code ports directly or structurally.

#### Positions Maintained

1. **Incremental evolution** of existing ChannelDetail + CortexChatPanel is the right approach. No rewrite.
2. **Replace-on-click** panel interaction (not tabs/split) for v1. YAGNI.
3. **Versioning deferred** to Phase 2. No user-edited content to version in v1.
4. **Tauri** stays as thin native shell. Integrations (tray, notifications) are separate scope.
5. **v1 is read-only.** Editing deferred until proven needed.

#### Final Assessment

The debate worked. My initial proposal was directionally correct but underscoped and dismissive of what could be reused from ai-chatbot. The synthesized plan — my evolution steps + artifact-porter's portable contract + devil's advocate's data model correction + plugin-architect's registry formalization — is stronger than any single hypothesis.

---

### Artifact Porter — Initial Hypothesis

**Agent:** artifact-porter
**Position:** Port ai-chatbot's artifact/canvas architecture into spacebot as the design blueprint. The concepts AND key abstractions are directly portable; only the wiring (SWR, Next.js API routes) needs adaptation.

#### How ai-chatbot's Artifact System Works (Deep Code Analysis)

The system has **5 architectural layers** that compose cleanly:

1. **Artifact Definition Registry** (`create-artifact.tsx:71-93`): An `Artifact<Kind, Metadata>` class that bundles: `kind` (string discriminator), `description`, `content` (React component), `actions` (toolbar buttons), `toolbar` (quick-action prompts), `initialize()`, and `onStreamPart()`. Each artifact type (code, text, image, sheet) is a standalone instance registered in `artifactDefinitions[]` at `artifact.tsx:32-37`.

2. **Global Artifact State** (`use-artifact.ts`): Uses SWR as a global reactive store (not for fetching -- the fetcher is `null`). A single `UIArtifact` object tracks: `documentId`, `content`, `kind`, `title`, `status` ("streaming" | "idle"), `isVisible`, and `boundingBox` (for animation origin). Any component reads via `useArtifactSelector()` or writes via `useArtifact().setArtifact()`.

3. **Data Stream Handler** (`data-stream-handler.tsx`): A headless component that consumes a `DataStreamContext` (populated by chat's `onData` callback). Routes stream deltas to the correct artifact definition's `onStreamPart()`, and handles common events: `data-id`, `data-title`, `data-kind`, `data-clear`, `data-finish`. Each artifact type handles its own custom stream types (e.g., `data-codeDelta` in code, `data-textDelta` in text).

4. **Artifact Panel** (`artifact.tsx:54-511`): A full-screen overlay with two regions -- a 400px chat column on the left (`ArtifactMessages` + `MultimodalInput`) and the artifact content area on the right. Supports version history (prev/next/diff via document array), dirty-state tracking with debounced saves, and per-artifact-type actions rendered via `artifactDefinition.content`.

5. **Server-Side Document Handlers** (`lib/artifacts/server.ts`): Each artifact kind has a `DocumentHandler` with `onCreateDocument()` and `onUpdateDocument()` that write stream parts and persist to DB via `saveDocument()`.

#### Answering Devil's Advocate's Questions Directly

**Q1: What specific files/functions are literally portable vs. must be rewritten?**

| File | Portable? | Rationale |
|------|-----------|-----------|
| `create-artifact.tsx` (93 lines) | **YES, verbatim** | Zero Next.js imports. Pure TypeScript: interfaces + class. Only import is `UIArtifact` type from `artifact.tsx`. |
| `artifacts/code/client.tsx` structure | **YES, structure** | The `codeArtifact = new Artifact<"code", Metadata>({...})` pattern, including `onStreamPart`, `content` component, and `actions` array. The Pyodide execution logic is optional. |
| `artifacts/text/client.tsx` structure | **YES, structure** | Same pattern. The `textArtifact` definition with `onStreamPart` for `data-textDelta`, `content` rendering an `Editor`, and version-aware actions. |
| `use-artifact.ts` | **REWRITE as zustand** | The SWR-as-global-store pattern (`useSWR("artifact", null)`) is a hack. Replace with ~40 lines of zustand. Same shape: `artifact`, `setArtifact`, `metadata`, `setMetadata`. |
| `data-stream-handler.tsx` | **ADAPT** | The stream routing switch (`data-id`, `data-title`, `data-kind`, `data-clear`, `data-finish`) ports directly. The `DataStreamContext` needs to wrap spacebot's SSE instead of ai-sdk's `onData`. |
| `artifact.tsx` (panel component) | **REDESIGN** | This is a 500-line component tightly coupled to SWR document fetching, full-screen overlay layout, and ai-chatbot's specific prop drilling. We take the layout concept (chat left + canvas right) but integrate into spacebot's `ChannelDetail` side-panel pattern instead. |
| `lib/artifacts/server.ts` | **REWRITE in Rust** | The `DocumentHandler` pattern (create/update with stream writing) maps to Rust endpoints. The `createDocumentHandler` factory is a nice pattern to port conceptually. |

**Summary: 2 files port verbatim, 2 port structurally, 3 need rewrite/redesign.** That's not "nothing is portable" -- it's a meaningful head start.

**Q2: How does spacebot's SSE protocol map to ai-chatbot's streaming?**

ai-chatbot streams via Vercel AI SDK's `DataUIPart` protocol with typed `delta.type` discriminators. Spacebot's `useCortexChat` already consumes SSE with typed events (`tool_started`, `tool_completed`, `done`, `error`). The mapping:

| ai-chatbot event | Spacebot SSE equivalent | Backend change |
|---|---|---|
| `data-id` | `artifact_open` (new event) | Add to Rust SSE writer |
| `data-title` | Included in `artifact_open` payload | None |
| `data-kind` | Included in `artifact_open` payload | None |
| `data-codeDelta` / `data-textDelta` | `artifact_delta` (new event) | Add to Rust SSE writer |
| `data-clear` | `artifact_clear` (new event) | Add to Rust SSE writer |
| `data-finish` | `artifact_finish` (new event) | Add to Rust SSE writer |

This is 4 new SSE event types in the Rust backend. The `consumeSSE` function in `useCortexChat.ts` already handles arbitrary event types -- just add cases.

**Q3: What replaces SWR for artifact state?**

Zustand. ~40 lines:

```typescript
interface ArtifactStore {
  artifact: UIArtifact;
  setArtifact: (updater: UIArtifact | ((current: UIArtifact) => UIArtifact)) => void;
  metadata: Record<string, any> | null;
  setMetadata: (updater: any) => void;
}
```

This matches the exact API surface of `useArtifact()` from ai-chatbot but without the SWR cache hack. Components using the artifact state don't change.

#### Where I Agree with Other Agents

**With spa-evolutionist:** The artifact panel should integrate into `ChannelDetail`'s existing side-panel, not as a full-screen overlay. ai-chatbot's overlay is for a single-chat app; spacebot's multi-agent context requires artifacts to be contextual within the channel view.

**With plugin-architect:** The `Artifact` class from ai-chatbot IS the plugin contract. I am arguing we should use it (or a close adaptation) rather than designing a new `ArtifactType` interface from scratch. The battle-tested interface handles everything: kind discrimination, typed metadata, streaming, rendering, actions, initialization.

**With devils-advocate on backend:** The backend IS the elephant. I specifically scoped 1 day for SSE event extensions and 1 day for document storage. The 4 new SSE event types and a `documents` table with CRUD endpoints is honest work but not complex -- spacebot's Rust API layer already has the patterns for both.

#### Where I Disagree

**With spa-evolutionist on "code is not portable":** As shown above, `create-artifact.tsx` is 93 lines with zero framework imports. It ports verbatim. The artifact type definitions (`code/client.tsx`, `text/client.tsx`) port structurally. Claiming "none of the code is portable" dismisses real reuse.

**With spa-evolutionist on "we don't need versioning":** ai-chatbot's append-only document versioning is trivial (~50 lines store, ~30 lines footer UI). When an agent rewrites an artifact, seeing the diff is a core UX feature. Cutting it to save 80 lines is false economy.

**With devils-advocate on "~300 lines is fiction":** Agreed. Honest estimate is 800-1200 lines frontend + ~200 lines Rust. Total ~8 working days.

#### Estimated Effort

- **Artifact store + definitions + panel:** ~3 days (port create-artifact.tsx, build zustand store, integrate panel into ChannelDetail)
- **SSE event extensions (Rust):** ~1 day (4 new event types in existing SSE infrastructure)
- **Document storage (Rust + SQLite):** ~1 day (new table + CRUD endpoints)
- **Initial artifact types (code, text):** ~2 days (port patterns from ai-chatbot, integrate editors)
- **Integration with ChannelDetail:** ~1 day

Total: **~8 days** to a working artifact system with code and text artifact types.

#### Risks

1. **Over-porting.** Mitigated by the clear port/adapt/rewrite breakdown above.
2. **Streaming protocol mismatch.** Manageable -- 4 new SSE event types is clean.
3. **Editor dependency weight.** CodeMirror is ~150KB gzipped. Worth it for code artifacts. Can lazy-load.

---

## Consensus / Recommendations

### Devil's Advocate — Final Consensus

**Written by:** devils-advocate (moderator)
**Status:** Debate converged. All four agents are aligned on direction.

---

The debate produced genuine disagreement that sharpened the plan. Here is where we landed.

### Architecture: SPA Evolution + Artifact Registry + ai-chatbot Concepts

All agents converge on one approach with different emphasis:

| Agent | Contribution to Consensus |
|-------|--------------------------|
| spa-evolutionist | 4-step evolution plan: extend TimelineItem, generalize right panel, add artifact renderers, wire into bot responses |
| plugin-architect | Formal artifact type registry contract (`ArtifactType` interface + registry map) to keep renderers pluggable |
| artifact-porter | Detailed portability analysis of ai-chatbot: `create-artifact.tsx` ports verbatim, artifact definitions port structurally, state layer rewrites to zustand, panel redesigns for ChannelDetail |
| tauri-native | Tauri stays as native shell. No multi-window. Complementary integrations (tray, notifications) are separate scope |

### Resolved Debates

**Artifact data model (devils-advocate vs. spa-evolutionist):** Separate `artifacts` table, not a field on TimelineMessage. Timeline items reference artifacts by ID. Artifact-porter agrees (proposes document/artifact storage). Spa-evolutionist's initial "bolt artifact onto message" approach is rejected.

**Artifact state management (artifact-porter vs. spa-evolutionist):** Zustand store for artifact state. Artifact-porter makes a convincing case: `useArtifact()` API surface is the same as ai-chatbot's but backed by zustand instead of SWR hack. Spa-evolutionist's `useState` in ChannelDetail is too simple once streaming and cross-component access are needed.

**Code portability (artifact-porter vs. devils-advocate):** I concede on this point. Artifact-porter demonstrated that `create-artifact.tsx` (93 lines, zero framework imports) ports verbatim, and artifact type definitions port structurally. My "nothing is portable" assessment was too aggressive. Revised: **~30% of the frontend artifact code ports directly or structurally.**

**SSE protocol (devils-advocate objection):** All agents now agree: v1 can ship complete artifacts in the `done` event. v2 adds 4 streaming event types (`artifact_open`, `artifact_delta`, `artifact_clear`, `artifact_finish`). The `consumeSSE` function in `useCortexChat.ts` already handles arbitrary event types.

**Artifact type interface (plugin-architect vs. devils-advocate):** Compromise: start with a minimal interface (`kind`, `label`, `component`) and add `onStreamDelta`, `actions`, `toolSchema` etc. when needed. The plugin-architect's full interface is the target; we grow toward it.

**Versioning (artifact-porter vs. spa-evolutionist):** Defer to Phase 2. Artifact-porter argues it's only ~80 lines. Spa-evolutionist says YAGNI. Devils-advocate ruling: it's cheap but not required for v1. Ship read-only first. Add versioning when users ask for "show me the previous version."

### What to Build

#### Backend (Rust)

1. **Artifacts table** in per-agent SQLite:
   ```sql
   CREATE TABLE artifacts (
       id TEXT PRIMARY KEY,
       channel_id TEXT NOT NULL,
       kind TEXT NOT NULL,
       title TEXT NOT NULL,
       content TEXT NOT NULL,
       metadata TEXT,           -- JSON for kind-specific data
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL
   );
   ```

2. **API endpoints:**
   - `GET /agents/:id/artifacts` — list artifacts for an agent
   - `GET /agents/:id/artifacts/:artifactId` — get single artifact
   - Extend timeline API to include `artifact_id` on timeline items

3. **SSE extension (v1):** Add optional `artifacts` array to `done` event payload.

4. **SSE streaming (v2):** Add `artifact_open`, `artifact_delta`, `artifact_clear`, `artifact_finish` event types.

5. **Bot integration:** When branch/worker produces structured output (code blocks, tables), tag with artifact metadata. This requires prompt engineering or tool-level conventions.

#### Frontend (TypeScript/React)

1. **Port `create-artifact.tsx`** from ai-chatbot (verbatim or near-verbatim). This provides the `Artifact` class and type definitions.

2. **Create zustand artifact store** (~40 lines) replacing ai-chatbot's SWR pattern:
   ```typescript
   interface ArtifactStore {
     artifact: UIArtifact;
     setArtifact: (updater: ...) => void;
     metadata: Record<string, any> | null;
     setMetadata: (updater: ...) => void;
   }
   ```

3. **Artifact type definitions:** Port `code` and `text` artifact types from ai-chatbot structurally. Adapt rendering to spacebot's component library and Tailwind classes.

4. **Context panel in ChannelDetail:** Generalize the right-side panel from "cortex chat only" to switchable:
   ```typescript
   type PanelContent =
     | { kind: "cortex"; agentId: string; channelId: string }
     | { kind: "artifact"; artifact: ArtifactData }
     | { kind: "closed" };
   ```

5. **SSE stream handler:** Adapt ai-chatbot's `data-stream-handler.tsx` pattern to route spacebot SSE events to artifact definitions' `onStreamPart()` handlers.

6. **Timeline artifact rendering:** When a timeline item has an `artifact_id`, render an artifact preview card. Clicking opens the artifact in the context panel.

### Implementation Phases

**Phase 1: Read-only artifacts (v1)**
- Artifacts table + CRUD endpoints
- Complete artifacts delivered in `done` SSE event
- Artifact type registry with `text` and `code` types
- Context panel in ChannelDetail (switchable between cortex chat and artifact view)
- Syntax highlighting via `shiki` (lazy-loaded) for code artifacts
- Estimated scope: ~800-1000 lines total (Rust + TypeScript)

**Phase 2: Streaming + polish**
- Streaming SSE events (`artifact_open`, `artifact_delta`, `artifact_finish`)
- Artifact actions (copy, download)
- Additional artifact types (image, table)
- Artifact versioning (append-only, ~80 lines)

**Phase 3: Advanced (when needed)**
- Artifact editing (code editor, text editor)
- Plugin-system integration (load artifact types from plugin directories)
- Artifact search/filtering across agents

### Estimated Effort

~8 working days for Phase 1, broken down:
- Rust backend (table, endpoints, SSE): ~3 days
- Frontend artifact system (store, registry, panel): ~3 days
- Integration + testing: ~2 days

### Key Risks

1. **Bot output tagging:** How does the bot decide output should be an artifact? Requires prompt engineering or explicit tool calls. Not fully designed yet.
2. **Code highlighting size:** `shiki` is ~2MB WASM. Must lazy-load. Consider `highlight.js` as lighter alternative.
3. **Large artifacts:** Full files or long documents need virtualized rendering. Not a v1 blocker but needs design.

### What We Are NOT Building

- No multi-window Tauri architecture
- No plugin subprocess for artifacts
- No full ai-chatbot code port (concepts + select files only)
- No document versioning in v1
- No artifact editing in v1
- No full-screen overlay (use side-panel pattern instead)

---

## Open Questions (Resolved)

| # | Question | Resolution |
|---|----------|-----------|
| 1 | Backend artifact protocol? | v1: complete artifacts in `done` event. v2: 4 new streaming event types. |
| 2 | Artifact persistence? | Separate `artifacts` table referenced by ID from timeline items. |
| 3 | Artifact state management? | Zustand store matching `useArtifact()` API surface. |
| 4 | Code artifact dependency? | `shiki` for syntax highlighting (lazy-loaded). NOT Monaco/CodeMirror for v1. |
| 5 | Scope? | v1 is read-only artifact display. Editing is Phase 3. |

## Open Questions — RESOLVED BY USER (2026-02-19)

| # | Question | Resolution |
|---|----------|-----------|
| 1 | Bot output tagging? | **Auto-detect** from structured output (code fences → code artifact, CSV data → sheet artifact, base64 image → image artifact, prose → text artifact) |
| 2 | Artifact deduplication? | **Update in place** — regenerated artifacts update the existing record, creating a new version entry |
| 3 | Cross-agent scope? | **All agents** — artifacts are queryable/viewable across the entire spacebot instance |
| 4 | Artifact type scope? | **All 4 from ai-chatbot** with full functionality: code (Pyodide execution), text (ProseMirror), image (viewer + copy), sheet (PapaParse spreadsheet) |

---

## Revised Scope (Human-Approved)

The user approved porting **all 4 artifact types with their full functionality** from `~/Projects/own/ai-chatbot`.

### Artifact Type Inventory

| Type | Key Features | New Dependencies |
|------|-------------|-----------------|
| **code** | CodeMirror editor, Pyodide Python execution (CDN), Console output, Run/Copy/Undo-Redo actions, Add-comments/Add-logs toolbar | `@codemirror/lang-javascript`, `@codemirror/lang-python` |
| **text** | ProseMirror rich text editor, Suggestions/inline comments, Diff view for versions, Polish/Suggest toolbar | 7 `prosemirror-*` packages |
| **image** | base64 PNG viewer, canvas-based copy to clipboard, Undo-Redo version actions | None |
| **sheet** | CSV spreadsheet editor, papaparse parsing, Copy-as-CSV, Format/Analyze toolbar | `papaparse`, `@types/papaparse` |

### Components to Port from ai-chatbot (~1,700 lines total)

| File | Lines | Strategy |
|------|-------|---------|
| `components/create-artifact.tsx` | 93 | Verbatim — zero Next.js imports |
| `components/code-editor.tsx` | 121 | Structural |
| `components/console.tsx` | 192 | Structural |
| `components/diffview.tsx` | 100 | Structural |
| `components/text-editor.tsx` | 164 | Structural — keep ProseMirror |
| `components/image-editor.tsx` | 48 | Near-verbatim |
| `components/sheet-editor.tsx` | 140 | Structural |
| `components/document-skeleton.tsx` | 39 | Structural |
| `components/toolbar.tsx` | 476 | Adapt to spacebot UI/icon conventions |
| `artifacts/code/client.tsx` | 280 | Structural |
| `artifacts/text/client.tsx` | 179 | Structural |
| `artifacts/image/client.tsx` | 76 | Near-verbatim |
| `artifacts/sheet/client.tsx` | 115 | Structural |

### New npm Packages Required
| Package | Purpose |
|---------|---------|
| `zustand` | Artifact state store |
| `@codemirror/lang-javascript` | Code editor JS/TS syntax |
| `@codemirror/lang-python` | Code editor Python syntax |
| `papaparse` + `@types/papaparse` | CSV parsing for sheet artifact |
| `react-resizable-panels` | Context panel layout |
| `prosemirror-example-setup` | Text editor |
| `prosemirror-inputrules` | Text editor |
| `prosemirror-markdown` | Text editor |
| `prosemirror-model` | Text editor |
| `prosemirror-schema-basic` | Text editor |
| `prosemirror-schema-list` | Text editor |
| `prosemirror-state` | Text editor |
| `prosemirror-view` | Text editor |
| `shiki` | Syntax highlighting (lazy-loaded) |

Already present in spacebot: `codemirror`, `framer-motion`, `sonner`, `recharts`, `@codemirror/state`, `@codemirror/view`, `@codemirror/theme-one-dark`

### Revised Effort Estimate (~19 working days)
- Rust backend (artifacts table, CRUD, SSE, auto-detection logic): ~4 days
- Core artifact system (create-artifact.tsx port, zustand store, context panel): ~3 days
- Code artifact (CodeMirror + Pyodide + Console): ~3 days
- Text artifact (ProseMirror + Suggestions + Diff): ~4 days
- Image artifact: ~1 day
- Sheet artifact (PapaParse + SpreadsheetEditor): ~2 days
- Integration, wiring, testing: ~2 days

---

## Decision

**Status: APPROVED — ready for implementation**

**Approach:** SPA Evolution + Artifact Type Registry + all 4 ai-chatbot artifact types with full functionality, natively integrated into spacebot's Rust/SSE/React architecture.

**Key decisions:**
- Auto-detect artifact type from structured output
- Update artifacts in place on regeneration (append version)
- Cross-agent artifact visibility
- All 4 artifact types: code (with Python execution), text (ProseMirror), image, sheet (CSV)
- Separate `artifacts` SQLite table per agent
- Zustand for artifact state (not SWR, not useState)
- Context panel in ChannelDetail switchable: `cortex | artifact | closed`

## Tauri Debug: API Gap Investigator

**Agent:** api-gap-investigator
**Date:** 2026-02-19
**Hypothesis:** Missing/broken API methods in `client.ts` are causing the Workers tab to crash (flashing).

### Verdict: CONFIRMED

### Evidence

**1. `AgentWorkers.tsx` imports non-existent exports from `client.ts`:**

- Line 4: `import { api, type WorkerRunInfo } from "@/api/client";`
- Line 22: `api.workerRuns(agentId, { limit: 50, status: ... })`

**2. `client.ts` does NOT export `WorkerRunInfo` or define `api.workerRuns`:**

- Searched all 1323 lines of `client.ts` — no `WorkerRunInfo` type, no `workerRuns` method on the `api` object.
- The git diff (`git diff HEAD -- interface/src/api/client.ts`) shows only two changes: added `avatar_path` field to `AgentProfile` interface, and added `avatarUrl`/`uploadAvatar` methods. No worker-related additions.

**3. The backend endpoint IS fully implemented:**

- `src/api/server.rs:62`: `.route("/agents/workers", get(workers::list_worker_runs))`
- `src/api/workers.rs:25-33`: Defines `WorkerRunInfo` struct with fields: `id`, `channel_id`, `task`, `result`, `status`, `started_at`, `completed_at`
- `src/api/workers.rs:36-38`: Defines `WorkerRunsResponse` struct with `runs: Vec<WorkerRunInfo>` and `total: i64`
- `src/api/workers.rs:41-103`: Full query implementation with status filtering, pagination, COUNT query

**4. Runtime behavior causing flashing:**

- At runtime, `api.workerRuns` is `undefined`
- Calling `api.workerRuns(agentId, {...})` throws `TypeError: api.workerRuns is not a function`
- `useQuery` (TanStack Query) catches the error, component renders in error state
- `refetchInterval: 10_000` (line 26) retries every 10 seconds, causing repeated error/retry cycles = "flashing"

### Fix Required

Add to `interface/src/api/client.ts`:

```typescript
// Type (matches Rust WorkerRunInfo in src/api/workers.rs:25-33)
export interface WorkerRunInfo {
  id: string;
  channel_id: string | null;
  task: string;
  result: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
}

export interface WorkerRunsResponse {
  runs: WorkerRunInfo[];
  total: number;
}

// Method on api object (calls GET /agents/workers)
workerRuns: (agentId: string, params: { limit?: number; offset?: number; status?: string } = {}) => {
  const search = new URLSearchParams({ agent_id: agentId });
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  if (params.status) search.set("status", params.status);
  return fetchJson<WorkerRunsResponse>(`/agents/workers?${search}`);
},
```

### Relationship to Chat Response Issue

**These are SEPARATE bugs.** The chat response display uses SSE events consumed by `useEventSource` / `useChannelLiveState` and rendered via `ChannelDetail` / `CortexChatPanel`. These components do not depend on `workerRuns` or the Workers tab. The Workers tab crash is an independent issue caused by the missing API client method.

## Tauri Debug: CSP/Security Investigator

**Agent:** csp-investigator
**Date:** 2026-02-19
**Hypothesis:** Tauri's Content Security Policy (CSP) or security capabilities are blocking fetch/XHR/SSE requests to localhost:19898.

### Verdict: RULED OUT

Tauri's CSP and security model are NOT blocking network requests. The architecture is designed in a way that avoids all CSP/CORS/capability issues entirely.

### Evidence

**1. CSP is explicitly disabled.**

`src-tauri/tauri.conf.json` line 19-21:
```json
"security": {
    "csp": null
}
```
Setting `csp` to `null` means Tauri applies NO Content Security Policy restrictions. The webview runs without any `connect-src`, `script-src`, or other CSP directives. All network requests are unrestricted at the CSP level.

**2. No Tauri capabilities directory exists.**

A glob search for `src-tauri/capabilities/**/*` returned zero files. While this is Tauri v2 (confirmed by `Cargo.toml` line 10: `tauri = { version = "2" }`), the capability system only applies to Tauri plugins like `@tauri-apps/plugin-http`. The app does NOT use any Tauri HTTP plugin -- it uses the browser's native `fetch()` and `EventSource` APIs directly.

**3. All network requests are same-origin -- no CORS possible.**

The frontend is served FROM the Rust HTTP server, not from a Tauri asset bundle:
- `tauri.conf.json` line 7: `"frontendDist": "http://localhost:19898"`
- `tauri.conf.json` line 13: `"url": "http://localhost:19898"`

The webview navigates to `http://localhost:19898`, and the Rust server (via `rust_embed` + `InterfaceAssets` in `src/api/server.rs`) serves both the frontend SPA and the API endpoints on the same origin.

The frontend API client (`interface/src/api/client.ts` lines 1-2) uses relative URLs:
```typescript
export const BASE_PATH: string = (window as any).__SPACEBOT_BASE_PATH || "";
const API_BASE = BASE_PATH + "/api";
```

All `fetch()` calls go to paths like `/api/status`, `/api/events`, etc. -- relative to the current origin (`http://localhost:19898`). This is same-origin by definition. CORS restrictions do not apply to same-origin requests.

**4. CORS is permissive anyway (belt and suspenders).**

`src/api/server.rs` lines 31-34:
```rust
let cors = CorsLayer::new()
    .allow_origin(Any)
    .allow_methods(Any)
    .allow_headers(Any);
```
Even if cross-origin requests were attempted (e.g., during development with a separate Vite dev server on port 19840), the server allows all origins, methods, and headers.

**5. EventSource (SSE) uses same-origin relative URL.**

`interface/src/hooks/useEventSource.ts` line 46:
```typescript
const source = new EventSource(url);
```
Where `url` is `API_BASE + "/events"` = `/api/events`. This resolves to `http://localhost:19898/api/events` -- same origin as the page. No CSP or CORS restrictions apply.

**6. Tauri treats this as an external URL, not a sandboxed asset.**

Because `frontendDist` and the window `url` both point to `http://localhost:19898` (not `tauri://localhost` or a local asset path), Tauri's webview treats this as a standard HTTP page. There is no Tauri-specific sandboxing or origin isolation. The `custom-protocol` feature is enabled in `Cargo.toml` but is not used since the window URL is an HTTP URL.

### Architecture Summary

```
Tauri (native shell)
  -> WebView navigates to http://localhost:19898
    -> Rust HTTP server serves:
       - Frontend SPA (via rust_embed, InterfaceAssets)
       - API endpoints at /api/*
       - SSE stream at /api/events
    -> All frontend requests are same-origin relative paths
    -> CSP: null (no restrictions)
    -> CORS: allow all (redundant but present)
```

### Conclusion

The two reported symptoms (messages reach bot but UI shows no response; Workers tab flashing) are NOT caused by CSP, CORS, or Tauri security capabilities blocking requests. The requests are provably same-origin, CSP is disabled, and CORS is fully permissive.

The root cause must be elsewhere:
- **Workers tab flashing:** Confirmed by api-gap-investigator as a missing `workerRuns` method in `client.ts` (see above section).
- **Chat responses not showing:** Likely in SSE event delivery, frontend event handling, or API state management -- not in network-level blocking.

## Tauri Debug: SSE Investigator

**Agent:** sse-investigator
**Date:** 2026-02-19
**Hypothesis:** SSE / EventSource failures in the Tauri webview cause the UI not to show responses and the Workers tab to flash.

### Verdict: SSE TRANSPORT IS NOT THE ROOT CAUSE

The EventSource mechanism works correctly in the Tauri webview. The symptoms have other explanations.

### Evidence Against SSE Being the Problem

**1. CSP does not block EventSource connections.**
`src-tauri/tauri.conf.json:19-21` sets `"security": { "csp": null }`. A null CSP means no Content-Security-Policy header is applied, so there are no restrictions on `connect-src` that would block EventSource to localhost. (Corroborates csp-investigator's findings.)

**2. Same-origin URL resolution works correctly.**
The Tauri webview loads `http://localhost:19898` (`tauri.conf.json:11`). The EventSource URL is constructed as a relative path:
- `client.ts:1`: `BASE_PATH = (window as any).__SPACEBOT_BASE_PATH || ""` (defaults to empty string)
- `client.ts:2`: `API_BASE = BASE_PATH + "/api"` (resolves to `"/api"`)
- `client.ts:1305`: `eventsUrl: \`${API_BASE}/events\`` (resolves to `"/api/events"`)
- `useEventSource.ts:46`: `new EventSource(url)` receives `"/api/events"`

This relative URL resolves to `http://localhost:19898/api/events` in the webview context -- same origin, no CORS issues, no custom protocol complications.

**3. Tauri v2 webviews support EventSource natively.**
Tauri v2 uses platform-native WebViews: WebKit on macOS, WebView2 on Windows, WebKitGTK on Linux. All three support the `EventSource` API as part of the HTML Living Standard. No polyfill or Tauri-specific adapter is needed.

**4. The SSE infrastructure has robust reconnection.**
`useEventSource.ts:16-18` defines exponential backoff: initial retry 1s, max 30s, multiplier 2x. The `onerror` handler (line 84-91) closes the failed source and schedules a reconnect. On reconnect, `onReconnect` triggers `syncStatusSnapshot()` (`useLiveContext.tsx:39-44`) which refetches channels, status, and agents to recover any missed state.

**5. The server sends keepalive pings.**
`src/api/system.rs:105-109`: The SSE endpoint uses `KeepAlive::new().interval(Duration::from_secs(15)).text("ping")`. This prevents intermediate proxies or the browser from timing out the connection.

**6. No Tauri-specific headers or permissions are needed.**
The `src-tauri/capabilities/` directory does not exist (confirmed via glob search). Tauri v2 capabilities control access to Tauri commands (`#[tauri::command]`), but the app uses zero Tauri commands -- all communication goes through the HTTP API. The webview is essentially a standard browser tab pointed at localhost.

### Workers Tab Flash: Corroborates API Gap Investigator

The Workers tab flash is caused by the missing `api.workerRuns()` method (confirmed by api-gap-investigator). The SSE-driven active workers section (`AgentWorkers.tsx:29-37`) would work correctly since it reads from `liveStates.workers` which is populated by SSE events (`worker_started`, `worker_status`, `worker_completed` in `useChannelLiveState.ts:606-616`). However, the historical runs section (line 20-27) calls the undefined `api.workerRuns()`, causing a TypeError on every render and refetch cycle.

### Chat Response Display: Potential Race Condition

For the "messages reach bot but UI doesn't show responses" symptom, the SSE transport layer is sound, but there is a potential race condition in the event flow:

1. **Event emission path (Rust):** When the bot produces a response, `src-tauri/src/main.rs:322-327` sends `ApiEvent::OutboundMessage` through `api_state.event_tx`. The SSE handler at `src/api/system.rs:66-110` receives this via `rx.recv()` and yields it as an SSE event with type `"outbound_message"`.

2. **Event consumption path (Frontend):** `useChannelLiveState.ts:199-214` handles `outbound_message` by pushing a new timeline item to the channel's state. But `pushItem` (line 164-170) calls `getOrCreate` (line 160-161) which returns an empty live state if the channel doesn't exist in `liveStates` yet.

3. **Channel initialization is async:** Channels are added to `liveStates` only when they appear in the `channelsData` response from `api.channels()` (polled every 10s at `useLiveContext.tsx:30-34`). If an SSE event arrives for a channel before the next poll, the `outbound_message` handler will create a temporary empty state for that channel -- but without `historyLoaded: true`, the history loading effect (`useChannelLiveState.ts:69-106`) won't fire for it since it checks `prev[channel.id]?.historyLoaded`.

4. **Result:** The outbound message IS captured in liveStates (via `getOrCreate`), so it should appear once the user navigates to that channel. However, the channel may not appear in the sidebar/channel list until the next 10-second poll. This is NOT specific to Tauri -- it would occur in any browser.

### SSE Event Handler Registration Timing

One subtle detail in `useEventSource.ts:60-69`: event handlers are registered using `Object.keys(handlersRef.current)` at `EventSource` creation time. The handler functions are looked up via `handlersRef.current[eventType]` at dispatch time (using a ref), so handler function updates work. However, if a NEW event type is added to the handlers map after the EventSource is created, it won't be listened to until the next reconnect. This is not currently an issue since all event types are registered upfront in `useChannelLiveState.ts:606-617`.

### Conclusion

- **SSE transport works correctly in Tauri.** No CSP blocks, no cross-origin issues, no missing WebView capabilities.
- **Workers tab flash** is caused by the missing `api.workerRuns()` method (api-gap investigator's finding), not SSE failure.
- **Missing chat responses** are likely NOT caused by SSE transport failure. The race condition between channel polling (10s interval) and SSE event delivery could cause delayed visibility of new channels but not missing messages in existing channels. Further investigation of the chat flow (channel creation, event emission, frontend rendering) is recommended.

## Tauri Debug: Devil's Advocate -- Synthesis

**Agent:** devils-advocate
**Date:** 2026-02-19
**Role:** Challenge every hypothesis with code evidence. Propose alternative root causes.

---

### Challenge 1: Against SSE Hypothesis

**Claim:** SSE/EventSource fails in Tauri webview.

**Counter-evidence:**

1. **Same-origin, no restrictions.** The Tauri webview loads `http://localhost:19898` and all API calls use relative URLs (`/api/events`). CSP is `null`. CORS allows everything. SSE uses the native `EventSource` API which is supported by all Tauri v2 webview backends (WebKit, WebView2, WebKitGTK).

2. **The SSE investigator agrees.** Their own conclusion: "SSE transport works correctly in Tauri. No CSP blocks, no cross-origin issues, no missing WebView capabilities."

3. **My challenge:** The SSE investigator correctly identified a channel polling race condition (10s interval vs. SSE event delivery), but understated its impact. The real issue is not the transport -- it is WHEN the EventSource connects relative to server readiness. See my alternative theory below.

**Verdict:** SSE transport is not inherently broken. Agreed with SSE investigator.

---

### Challenge 2: Against API Gap Hypothesis

**Claim:** Missing `api.workerRuns` + `WorkerRunInfo` causes Workers tab crash/flash.

**Counter-evidence (conceded with nuance):**

1. **The gap is real and confirmed.** `AgentWorkers.tsx:4` imports `type WorkerRunInfo` from `@/api/client`, and `AgentWorkers.tsx:22` calls `api.workerRuns()`. Neither exists in `client.ts`. The backend route exists at `server.rs:62` and `workers.rs` is fully implemented.

2. **My challenge on "flashing" semantics:** The api-gap-investigator says `refetchInterval: 10_000` causes "repeated error/retry cycles = flashing." This is imprecise. TanStack Query with a 10-second refetch interval that throws a TypeError would show: error state for 10 seconds, brief loading state, error again. This is a stable error pattern, not rapid visual flashing. True "flashing" (sub-second visual toggling) would require something causing the React component to unmount and remount rapidly -- like a parent error boundary catching and recovering.

3. **Bottom line:** This IS a real bug. The fix (add `workerRuns` method and `WorkerRunInfo` type to `client.ts`) is correct and necessary. The symptom description of "flashing" is likely user shorthand for "the Workers tab doesn't work."

**Verdict:** Confirmed. Independent bug, cleanly fixable.

---

### Challenge 3: Against CSP Hypothesis

**Claim:** Tauri CSP blocks fetch/SSE to localhost.

**Counter-evidence:**

1. **Definitively ruled out.** `tauri.conf.json:19-21`: `"csp": null`. No CSP applies.
2. **No capabilities directory.** Zero files in `src-tauri/capabilities/`.
3. **No Tauri commands.** Zero `#[tauri::command]` in `main.rs`. Everything goes through HTTP.

**Verdict:** Ruled out. CSP investigator's own findings confirm this.

---

### Challenge 4: Against Chat Flow Hypothesis

**Claim:** Responses go to Discord, not to the Tauri UI.

**Counter-evidence:**

1. **Responses go to BOTH.** The outbound routing in `main.rs:317-376` sends `OutboundMessage` events to the SSE bus (`api_event_tx.send()` at lines 322-327) AND to the messaging adapter (`messaging_for_outbound.respond()` at lines 367-370). The Tauri UI receives events via SSE; Discord receives them via the messaging adapter. Both happen.

2. **However:** If the SSE connection is not active (disconnected, in backoff), the SSE events are lost. `tokio::sync::broadcast` (capacity 256 at `main.rs:695`) does not retroactively deliver events to late subscribers. A new SSE connection only receives events emitted AFTER it subscribes.

**Verdict:** The flow architecture is correct -- events go to both SSE and messaging. The issue is SSE connection timing, not routing.

---

### Devil's Advocate Alternative Theory: Startup Race Condition

**The primary root cause for "messages reach bot but UI shows no response" is a startup race condition.**

**Evidence chain:**

1. **Server starts asynchronously.** `src-tauri/src/main.rs:16-28`: The `.setup()` callback spawns the server in `std::thread::spawn` and returns `Ok(())` immediately without waiting for the server to be ready.

2. **Webview loads immediately.** After `.setup()` returns, `.run()` opens the webview to `http://localhost:19898`. The server has not finished initializing yet. The `start_server()` function must: load config, init tracing, start IPC, create LlmManager (async), init embedding model, initialize all agents (DB connections, file I/O), start messaging adapters, and FINALLY bind the TCP listener.

3. **EventSource enters backoff.** The webview tries to connect `EventSource` to `/api/events`. The server is not listening yet. Connection fails. Exponential backoff kicks in: 1s -> 2s -> 4s -> 8s -> 16s -> 30s. In the worst case, the EventSource is disconnected for ~30 seconds after the server becomes ready.

4. **Events lost during backoff window.** If a Discord message arrives and the bot responds during this backoff window, the `OutboundMessage` SSE event is emitted to the broadcast channel but NO subscribers are connected. The event is dropped. When EventSource finally reconnects, `onReconnect` fires and invalidates queries (fetching channel list, status) -- but it does NOT fetch message history for all channels. Only channels that the user navigates to will load their history.

5. **The SSE investigator's race condition observation supports this.** They noted: "Channels are added to liveStates only when they appear in the channelsData response from api.channels() (polled every 10s)." This compounds the startup issue -- even after SSE reconnects, new channels won't appear for up to 10 seconds.

**Why this explains the reported symptoms:**

- "Messages reach the bot" -- YES, Discord adapter receives the message, routes it to the agent channel, bot processes it
- "UI shows no response" -- The SSE event was emitted while EventSource was disconnected. Lost. The response IS sent to Discord, so the user sees it there. The Tauri UI missed it.
- "Workers tab flashes" -- Separate bug (missing `api.workerRuns`), but exacerbated by the startup race: during the connection failure period, ALL API calls fail, creating a cascade of errors.

---

### Final Synthesis: Ranked Findings

| Priority | Issue | Root Cause | Fix | Confidence |
|----------|-------|------------|-----|------------|
| **P1** | Workers tab broken | Missing `api.workerRuns()` + `WorkerRunInfo` in `client.ts` | Add type and method to client.ts (see api-gap-investigator) | **Confirmed** -- code-level proof |
| **P2** | Chat responses not showing in Tauri UI | Startup race: webview loads before server is ready, SSE events lost during backoff | Add readiness check in Tauri `.setup()` before returning Ok | **High** -- architectural analysis |
| **P3** | SSE reconnection loses events | `tokio::sync::broadcast` drops events when no subscribers | On SSE reconnect, fetch recent messages for active channels | **Medium** -- not Tauri-specific |
| **P4** | New channels delayed in UI | Channel list polled every 10s, SSE has no "channel_created" event | Add `channel_created` SSE event type, or reduce poll interval | **Low** -- minor UX issue |

### What We Agree On (Cross-Agent Consensus)

1. **CSP is not the issue.** All investigators confirm `"csp": null` eliminates CSP as a factor.
2. **SSE transport works correctly** when connected. The `EventSource` API, same-origin URL resolution, and server-side SSE implementation are all sound.
3. **The `api.workerRuns` gap is a real, independent bug.** The backend endpoint exists; the frontend client method does not.
4. **The response flow is correctly designed** to emit events to both SSE and messaging adapters. The issue is about connection timing, not routing logic.

### What Needs Resolution

1. **Is the startup race condition observable?** Someone should time the server initialization on the actual hardware. If `start_server()` takes < 1 second, the race condition is unlikely to be the cause. If it takes 5+ seconds, it is almost certainly the cause.
2. **Does the user see the "Connecting..." banner?** The `ConnectionBanner` component shows "Connecting..." when `connectionState` is `"connecting"` and `hasData` is false. If the user reports seeing this banner before the symptoms occur, that confirms the startup race theory.

## Tauri Debug: Chat Flow Investigator

**Agent:** chat-flow-investigator
**Date:** 2026-02-19
**Hypothesis:** The outbound message/response flow is broken in Tauri because messages reach the bot (via Discord/Slack) but the Tauri UI shows nothing, and the Workers tab is flashing.

### Verdict: CHAT FLOW IS ARCHITECTURALLY CORRECT; TWO SEPARATE BUGS + STARTUP RACE

This investigation corroborates and extends the findings from all other investigators. The chat flow code has no gaps. The issues are: (1) missing API client method for Workers tab, (2) startup race condition causing SSE events to be lost during initial connection backoff.

### Full Message Flow Trace

#### Inbound Message Path (Discord/Slack -> Tauri UI)

1. **Messaging adapter receives message** (e.g., Discord gateway event).
2. **`messaging_manager.start()`** produces a merged `inbound_stream` of `InboundMessage` items (`src-tauri/src/main.rs:874-878`).
3. **Main event loop** (`main.rs:207-414`) polls `inbound_stream` in `tokio::select!`.
4. **Agent resolution:** `resolve_agent_for_message()` determines which agent handles the message (`main.rs:218-224`).
5. **Channel creation** (if new conversation): creates `Channel`, `response_tx`/`response_rx` pair, spawns channel event loop (`main.rs:229-306`).
6. **SSE emit: InboundMessage** (`main.rs:398-403`): `api_state.event_tx.send(ApiEvent::InboundMessage { agent_id, channel_id, sender_id, text })`.
7. **Message forwarded** to channel via `active.message_tx.send(message)` (`main.rs:405-412`).

#### Outbound Response Path (Bot -> Discord + Tauri UI)

1. **Channel processes message**, generates `OutboundResponse` items sent to `response_tx`.
2. **Outbound routing task** (`main.rs:317-376`) reads from `response_rx`:
   - **For `OutboundResponse::Text`** (`main.rs:321-327`): Sends `ApiEvent::OutboundMessage` to SSE **BEFORE** calling `messaging_for_outbound.respond()`.
   - **For `OutboundResponse::ThreadReply`** (`main.rs:328-334`): Same pattern -- SSE event emitted first.
   - **For `Status::Thinking`** (`main.rs:335-342`): Emits `ApiEvent::TypingState { is_typing: true }`.
   - **For `Status::StopTyping`** (`main.rs:343-349`): Emits `ApiEvent::TypingState { is_typing: false }`.
3. **After SSE emission**, the response is sent to the messaging adapter for Discord/Slack delivery (`main.rs:352-374`).

**Key finding: SSE events are emitted BEFORE the messaging adapter call.** The UI does not depend on Discord delivery succeeding.

#### Two Independent Channels for Chat

1. **Discord/Slack channel messages** use the **global SSE stream** (`/api/events`) consumed by `useEventSource` -> `useChannelLiveState` -> `ChannelDetail` timeline.
2. **Cortex chat** uses a **per-request SSE response body** from `POST /api/cortex-chat/send`, consumed by `useCortexChat` -> `CortexChatPanel`. This is completely independent of the global SSE stream.

If the global SSE is broken, Discord channel messages won't appear in the UI, but Cortex chat still works (and vice versa).

### Answers to Investigation Questions

**Q1: SSE event order for a Discord message + response:**
1. `inbound_message` (message arrives)
2. `typing_state { is_typing: true }` (channel starts thinking)
3. Zero or more `worker_started`, `branch_started`, `tool_started/completed`, `worker_completed`, `branch_completed`
4. `outbound_message` (bot response text)
5. `typing_state { is_typing: false }` (processing ends)

**Q2: Does frontend listen for `outbound_message`?**
YES. `useChannelLiveState.ts:199-214` handles it by pushing an assistant message to the timeline.

**Q3: Race condition where SSE event is emitted but frontend hasn't connected?**
YES -- the startup race identified by devil's-advocate. The server spawns asynchronously in `std::thread::spawn` (`main.rs:17`). The webview loads immediately. If messages arrive during the backoff window, events are lost. `broadcast::Sender::send` drops events with no subscribers.

**Q4: Different flow for Cortex chat vs Discord?**
YES, completely separate. Cortex chat POSTs to `/api/cortex-chat/send` and reads the response body SSE stream. It never touches the messaging adapter.

**Q5: Could Cortex chat responses go to Discord instead of the UI?**
NO. `CortexChatSession` processes locally with the LLM and streams back through the HTTP response body. No messaging adapter involved.

**Q6: Workers tab flashing related to SSE?**
NO. Caused by missing `api.workerRuns()` in `client.ts` (api-gap-investigator finding).

### Cross-Agent Consensus

All 5 investigators agree:
1. **CSP/CORS not the issue** -- `csp: null`, same-origin, CORS allows all.
2. **SSE transport works when connected** -- native `EventSource`, no blocking.
3. **`api.workerRuns` gap is a confirmed, independent bug** -- backend exists, client method missing.
4. **Chat response flow is correctly designed** -- events go to both SSE and messaging adapters.
5. **Primary suspect for "nothing happening"** is the **startup race condition** where the webview opens before the HTTP server is ready, causing SSE connection failure and event loss during backoff recovery.

---

## Tauri Debug: Final Consensus

**Status:** Complete — 5-agent debate concluded
**Date:** 2026-02-19
**Requires human plan approval before any code changes.**

### Two Bugs, One Architectural Issue

The 5-agent investigation converged on a clear, evidence-backed diagnosis. The symptoms are caused by **two independent bugs** and **one architectural issue**.

---

### Bug 1 — Workers Tab (P1, Confirmed)

**Root cause:** `api.workerRuns()` and `WorkerRunInfo` are missing from `interface/src/api/client.ts`.

- `AgentWorkers.tsx:4` imports `type WorkerRunInfo`; `AgentWorkers.tsx:22` calls `api.workerRuns()`
- Neither exists in `client.ts` (confirmed by git diff — only avatar changes were added)
- The backend is fully implemented: `src/api/workers.rs` + route at `server.rs:62`
- At runtime: `api.workerRuns is not a function` TypeError → `useQuery` error state → 10s `refetchInterval` retries → broken/blank Workers tab

**Fix:** Add to `client.ts`:
```typescript
export interface WorkerRunInfo {
  id: string;
  channel_id: string | null;
  task: string;
  result: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
}
export interface WorkerRunsResponse {
  runs: WorkerRunInfo[];
  total: number;
}
// In api object:
workerRuns: (agentId: string, params: { limit?: number; offset?: number; status?: string } = {}) => {
  const search = new URLSearchParams({ agent_id: agentId });
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  if (params.status) search.set("status", params.status);
  return fetchJson<WorkerRunsResponse>(`/agents/workers?${search}`);
},
```

---

### Bug 2 — Chat Responses Not Appearing (P2, High Confidence)

**Root cause:** Startup race condition — Tauri webview loads before the Rust HTTP server is ready.

**Evidence chain:**
1. `src-tauri/src/main.rs:16-28`: `.setup()` spawns the server in `std::thread::spawn` and returns `Ok(())` immediately — no readiness wait
2. `.run()` immediately opens the webview to `http://localhost:19898`
3. Server hasn't bound TCP yet — `EventSource` fails, enters exponential backoff (1s → 2s → 4s → 8s → 16s → 30s max)
4. A Discord message arrives and the bot responds during this window
5. `ApiEvent::OutboundMessage` is sent to `tokio::sync::broadcast` — but **no subscribers are connected**
6. The event is dropped permanently; broadcast channels do not replay
7. When EventSource finally reconnects, `onReconnect` invalidates query caches but does NOT fetch message history for all channels
8. The bot's response is visible in Discord but never reaches the Tauri UI

**Confirmation signal:** Does the user see the "Connecting..." banner (`ConnectionBanner.tsx`) at startup? If yes, this is the race condition.

**Fix (two options):**

*Option A — Server readiness probe in Tauri setup (preferred):*
```rust
// In .setup(), poll until the server is accepting connections
// before returning Ok(())
async fn wait_for_server(port: u16) {
    for _ in 0..60 {
        if tokio::net::TcpStream::connect(("127.0.0.1", port)).await.is_ok() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}
```

*Option B — SSE reconnect fetches recent history:*
Extend `onReconnect` in `useLiveContext.tsx` to also fetch recent messages for all known channels, so missed events are recovered from the database after reconnect.

---

### Ruled Out (Unanimous)

| Hypothesis | Verdict | Evidence |
|-----------|---------|---------|
| CSP blocking SSE/fetch | **Ruled out** | `tauri.conf.json`: `"csp": null`; no restrictions |
| CORS blocking requests | **Ruled out** | All calls are same-origin; server has `allow_origin(Any)` |
| EventSource not supported in Tauri | **Ruled out** | Native WebKit/WebView2 support; no polyfill needed |
| Tauri capabilities restricting HTTP | **Ruled out** | No `capabilities/` directory; zero `#[tauri::command]` |
| Response goes to Discord only | **Ruled out** | SSE event is emitted BEFORE Discord delivery (`main.rs:322-327`) |

---

### Fixes Required (Awaiting Human Approval)

| # | File | Change | Impact |
|---|------|--------|--------|
| 1 | `interface/src/api/client.ts` | Add `WorkerRunInfo`, `WorkerRunsResponse`, `api.workerRuns()` | Fixes Workers tab |
| 2 | `src-tauri/src/main.rs` | Add server readiness probe in `.setup()` before returning | Fixes missed events on startup |
| 3 | `interface/src/hooks/useLiveContext.tsx` | Extend `onReconnect` to fetch recent messages per channel | Resilience improvement |
