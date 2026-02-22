# OpenCode Model Routing

## Overview

OpenCode model routing provides intelligent, per-task model selection for OpenCode workers using a hybrid approach:

1. **Explicit model parameter** - Users can specify a model directly via `spawn_worker`
2. **Config-based routing** - Administrators can define pattern-based routing rules
3. **Intelligent classification** - System automatically classifies tasks and selects appropriate models

## Configuration

### Basic Setup

Add to your `spacebot.toml`:

```toml
[defaults.opencode]
enabled = true
path = "opencode"  # or full path

# Default model for OpenCode workers (optional)
default_model = "anthropic/claude-sonnet-4-20250514"

# Task-based routing (optional)
task_routing = [
    # Pattern matching → model
    "refactor" = "anthropic/claude-sonnet-4-20250514"
    "test" = "anthropic/claude-haiku-4-20250514"
    "documentation" = "anthropic/claude-haiku-4-20250514"
]
```

### Configuration Fields

- **`default_model`** (optional): Fallback model when no routing rule matches
- **`task_routing`** (optional): HashMap of task patterns to models
  - Patterns are matched case-insensitively
  - If task contains the pattern, the associated model is used
  - Example: `"refactor"` matches "Refactor the authentication module"

## Usage

### Via spawn_worker tool

```json
{
  "task": "Refactor the authentication module",
  "worker_type": "opencode",
  "directory": "/path/to/project",
  "model": "anthropic/claude-sonnet-4-20250514"
}
```

### Automatic classification

When no model is specified, the system intelligently classifies the task:

```json
{
  "task": "Fix typo in function name",
  "worker_type": "opencode",
  "directory": "/path/to/project"
}
```

This would use `anthropic/claude-haiku-4-20250514` based on the "simple task" classification.

## Classification Rules

The intelligent classification follows these rules:

### Complex Refactoring (High-end Model)
Uses: `anthropic/claude-sonnet-4-20250514`

Triggers:
- "refactor", "rewrite", "rearchitecture", "redesign"
- "migration", "multi-file", "codebase"
- Task length > 200 chars OR > 5 lines

### Simple Tasks (Fast Model)
Uses: `anthropic/claude-haiku-4-20250514`

Triggers:
- "fix typo", "fix bug", "update comment"
- "rename", "simple fix", "quick fix"
- Task length < 150 chars

### Documentation (Fast Model)
Uses: `anthropic/claude-haiku-4-20250514`

Triggers:
- "document", "documentation", "readme"
- "docstring", "comment", "explain"

### Test Generation (Mid-tier Model)
Uses: `anthropic/claude-sonnet-4-20250514`

Triggers:
- "test", "testing", "unit test"
- "integration test", "test coverage"

## Priority Order

Model selection follows this priority:

1. **Explicit model parameter** in `spawn_worker` call
2. **Config-based routing** from `[defaults.opencode.task_routing]`
3. **Intelligent classification** based on task characteristics
4. **Default model** from `[defaults.opencode.default_model]`
5. **OpenCode's default** (if none of the above match)

## Examples

### Example 1: Config-based routing

**Config:**
```toml
[defaults.opencode.task_routing]
"urgent" = "anthropic/claude-sonnet-4-20250514"
"docs" = "anthropic/claude-haiku-4-20250514"
```

**Task:** "This is an urgent bug fix needed now"
**Result:** Uses `anthropic/claude-sonnet-4-20250514` (matches "urgent")

### Example 2: Intelligent classification

**Task:** "Refactor the entire authentication module across multiple files to use new architecture"
**Result:** Uses `anthropic/claude-sonnet-4-20250514` (complex refactoring)

### Example 3: Simple task

**Task:** "Fix typo in user name"
**Result:** Uses `anthropic/claude-haiku-4-20250514` (simple task)

### Example 4: Explicit override

**Call:**
```json
{
  "task": "Simple fix",
  "model": "custom/model-name"
}
```
**Result:** Uses `custom/model-name` (explicit parameter wins)

## API Changes

### SpawnWorkerArgs

New field added:
```rust
pub struct SpawnWorkerArgs {
    pub task: String,
    pub interactive: bool,
    pub skill: Option<String>,
    pub worker_type: Option<String>,
    pub directory: Option<String>,
    pub model: Option<String>,  // NEW
}
```

### OpenCodeConfig

New fields added:
```rust
pub struct OpenCodeConfig {
    pub enabled: bool,
    pub path: String,
    pub max_servers: usize,
    pub server_startup_timeout_secs: u64,
    pub max_restart_retries: u32,
    pub permissions: OpenCodePermissions,
    pub default_model: Option<String>,        // NEW
    pub task_routing: HashMap<String, String>, // NEW
}
```

### spawn_opencode_worker_from_state

Updated signature:
```rust
pub async fn spawn_opencode_worker_from_state(
    state: &ChannelState,
    task: impl Into<String>,
    directory: &str,
    interactive: bool,
    model: Option<&str>,  // NEW
) -> std::result::Result<crate::WorkerId, AgentError>
```

## Implementation Details

### Classification Module

Located at: `src/opencode/classification.rs`

Key function:
```rust
pub fn classify_opencode_task(
    task: &str,
    config_routing: &HashMap<String, String>,
    default_model: &Option<String>,
) -> Option<String>
```

The classification:
1. Checks config-based routing first (pattern matching)
2. Falls back to intelligent classification
3. Returns default_model if no match
4. Returns None to let OpenCode decide if no default

### Integration Point

The classification is integrated into `spawn_opencode_worker_from_state` in `src/agent/channel.rs`:

```rust
// Determine which model to use
let model_to_use = if let Some(model_name) = model {
    Some(model_name.to_string())
} else {
    classify_opencode_task(
        &task,
        &opencode_config.task_routing,
        &opencode_config.default_model,
    )
};

// Apply model selection
if let Some(model_name) = model_to_use {
    worker = worker.with_model(model_name);
}
```

## Testing

Unit tests are included in `src/opencode/classification.rs`:

```bash
cargo test classification
```

Tests cover:
- Complex refactoring classification
- Simple task classification
- Documentation task classification
- Test generation classification
- Config routing override
- Default model fallback

## Backward Compatibility

- **No breaking changes**: All existing code continues to work
- **Optional fields**: `model` parameter is optional
- **Default behavior**: If no model is specified, OpenCode uses its default
- **Config optional**: `default_model` and `task_routing` are optional in config

## Migration Guide

No migration needed! The feature is fully backward compatible.

To adopt the new feature:
1. Add `model` field to `spawn_worker` calls (optional)
2. Add `[defaults.opencode]` configuration (optional)
3. Let intelligent classification handle the rest

## Performance Considerations

- **Minimal overhead**: Classification is O(n) where n = number of routing rules
- **Cached config**: Routing config is loaded once and reused
- **No network calls**: Classification runs entirely locally
- **Fast execution**: Simple string matching and keyword detection

## Future Enhancements

Potential improvements:
1. ML-based classification using embeddings
2. Cost-aware routing (balance speed vs quality)
3. User feedback loop for improving classification
4. A/B testing different routing strategies
5. Metrics and monitoring for routing effectiveness
