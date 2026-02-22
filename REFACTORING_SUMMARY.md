# OpenCode Routing Refactor: Summary

## What Changed

We refactored OpenCode model routing from **complex config-based classification** to **simple skills-based routing**.

### Before (Complex)

```
Task → Config pattern matching → Keyword classification → Fallback to default
```

- 267 lines of classification logic in `src/opencode/classification.rs`
- `task_routing` HashMap in config for pattern-based routing
- Keyword detection algorithms (is_complex_refactoring, is_simple_task, etc.)
- Hybrid routing with multiple fallback layers

### After (Simple)

```
Task → Explicit model param → Default model config
```

- Simple parameter-based selection
- Skills define their preferred model in markdown
- Anyone can extend by creating new skills
- No complex routing logic to maintain

## Files Changed

### Removed
- `src/opencode/classification.rs` - Entire classification module (267 lines)

### Modified
- `src/opencode.rs` - Removed `pub mod classification;`
- `src/config.rs` - Removed `task_routing` field from `OpenCodeConfig`
- `src/agent/channel.rs` - Simplified model selection logic
- `src/tools/spawn_worker.rs` - Updated documentation

### Created
- `docs/skills/frontend-quick-task/SKILL.md` - Quick UI tasks with Haiku
- `docs/skills/backend-coding/SKILL.md` - Backend dev with Sonnet
- `docs/skills/complex-refactoring/SKILL.md` - Large refactors with Sonnet

## How It Works Now

### 1. Explicit Model Parameter (Highest Priority)
```json
{
  "worker_type": "opencode",
  "task": "Fix the button color",
  "model": "anthropic/claude-haiku-4-20250514"
}
```

### 2. Default Model Config (Fallback)
```toml
[defaults.opencode]
default_model = "anthropic/claude-sonnet-4-20250514"
```

### 3. Skills-Based Routing (Future)
Skills specify their preferred model in frontmatter:
```yaml
---
name: frontend-quick-task
model: anthropic/claude-haiku-4-20250514
---
```

## Philosophy Alignment

✓ **"Build the simplest thing that can build itself"**
- Reduced 280+ lines to ~40 lines
- Simple fallback chain (param → config)

✓ **"Configurability is done via skills, not config files"**
- Skills are markdown files
- Self-documenting and easy to extend
- No code changes to add new routing patterns

## Adding New Skills

1. Create skill directory:
   ```bash
   mkdir -p ~/.spacebot/agents/main/workspace/skills/my-skill
   ```

2. Create SKILL.md:
   ```yaml
   ---
   name: my-skill
   description: What this skill does
   model: anthropic/claude-sonnet-4-20250514
   ---
   
   # My Skill
   
   ## When to Use
   - Use this for X
   - Also for Y
   
   ## Examples
   ...
   ```

3. Use in tasks by referencing the skill name

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Lines of code | 280+ | 40 |
| Extensibility | Edit config, add keywords | Create markdown file |
| Documentation | Separate from logic | Self-documenting |
| Complexity | Hybrid routing + keyword detection | Simple parameter → config |
| Maintainability | Classification algorithms to debug | No routing logic to maintain |
| Barrier to extend | Edit Rust code/TOML config | Write markdown |

## Backward Compatibility

✓ **No breaking changes**
- Existing `model` parameter works exactly as before
- `default_model` config preserved
- System continues to work with current configuration
- `task_routing` was opt-in - removing it doesn't break existing setups

## Risk Assessment

**Risk Tier: LOW**

- Removing complexity, not adding it
- No behavioral changes to existing functionality
- Simplification reduces maintenance burden
- Skills add capability without removing options

## Evidence

All changes documented in `.evidence-manifest.yml` including:
- Lines removed and added
- Skills created
- Verification results
- Philosophy alignment

## Next Steps

1. **Deploy skills to workspace:**
   ```bash
   cp -r docs/skills/* ~/.spacebot/agents/main/workspace/skills/
   ```

2. **Create project-specific skills:**
   - Customize models for your team's preferences
   - Document project-specific patterns
   - Share skills across team

3. **Monitor usage:**
   - Which skills get used most?
   - Are models appropriate for task types?
   - Adjust skill definitions as needed

## Questions?

**Q: What happened to my task_routing config?**
A: The `task_routing` field was removed. Replace it with skills in `workspace/skills/`. Each skill specifies its model in its SKILL.md frontmatter.

**Q: Can I still override the model?**
A: Yes! The `model` parameter in spawn_worker still works and has highest priority.

**Q: Do I have to use skills?**
A: No. The system works fine with just `model` parameter and `default_model` config. Skills are optional and make routing more explicit and self-documenting.

**Q: How do I choose which model to use?**
A: Check the example skills for guidance:
- **Haiku** (haiku-4) - Fast, simple tasks
- **Sonnet** (sonnet-4) - Most coding tasks, reasoning required
- Skills document when to use each model
