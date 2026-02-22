---
name: complex-refactoring
description: Use for large-scale refactors, architecture changes, and multi-file transformations
model: anthropic/claude-sonnet-4-20250514
---

# Complex Refactoring Skill

## When to Use

Use this skill for complex changes requiring deep understanding:
- Refactor large modules or entire subsystems
- Change architectural patterns (e.g., MVC to clean architecture)
- Migrate between libraries or frameworks
- Restructure codebase organization
- Implement design patterns across multiple files
- Performance optimizations requiring architectural changes

## Model Choice

Uses **Claude Sonnet** - maximum reasoning capability for complex transformations.

## Examples

**Good use cases:**
- "Refactor the authentication module to use a cleaner architecture"
- "Migrate from Redux to Context API across the entire app"
- "Extract common logic into a shared service layer"
- "Restructure the project to use domain-driven design"
- "Optimize database queries to reduce N+1 problems"

**NOT for:**
- Simple UI fixes (use `frontend-quick-task` skill)
- Single-feature additions (use `backend-coding` skill)

## How It Works

When you invoke this skill:
1. The system spawns an OpenCode worker with Claude Sonnet
2. The worker analyzes the entire affected codebase
3. Changes are planned before implementation
4. Tests are updated to match new structure
5. Migration paths are considered

## Tips

- Explain the "why" behind the refactor, not just "what"
- Provide context about current architecture and pain points
- Mention if backward compatibility is needed
- Specify if there are performance or maintainability goals
- Include information about the project's domain/business logic

## Best Practices

- Start by understanding existing code before changing
- Make changes incrementally when possible
- Update tests alongside code changes
- Document architectural decisions
- Consider deprecation strategies for public APIs
- Run tests after significant changes

## Before You Begin

Ask yourself:
- Is this change necessary? What problem does it solve?
- Can it be broken into smaller, safer changes?
- Do I understand the current architecture well enough?
- Will this improve code quality, maintainability, or performance?
