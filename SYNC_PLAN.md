# Upstream Sync Plan

This document outlines the logical batches for resolving merge conflicts between our local branch and `upstream/main`. Gemini CLI workers should tackle these batches sequentially.

## Batch 1: Lockfiles (Auto-regeneration)
*Note: Do not manually resolve these. Regenerate them using your package manager.*
- `interface/bun.lock`
- `interface/package-lock.json`

## Batch 2: Frontend React
- `interface/src/api/client.ts`
- `interface/src/components/WebChatPanel.tsx`
- `interface/src/routes/Overview.tsx`

## Batch 3: Backend APIs
- `src/api.rs`
- `src/api/agents.rs`
- `src/api/channels.rs`
- `src/api/providers.rs`
- `src/api/server.rs`
- `src/api/state.rs`

## Batch 4: Backend Core & Config
- `src/config.rs`
- `src/lib.rs`
- `src/main.rs`
- `src/prompts/text.rs`
- `src/tools.rs`
- `src/agent/channel.rs`
- `src/agent/worker.rs`

## Batch 5: Tests
- `tests/bulletin.rs`
- `tests/context_dump.rs`
