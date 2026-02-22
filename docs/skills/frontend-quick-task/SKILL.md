---
name: frontend-quick-task
description: Use for quick frontend tasks like UI fixes, styling updates, and simple component changes
model: anthropic/claude-haiku-4-20250514
---

# Frontend Quick Task Skill

## When to Use

Use this skill for quick frontend tasks that can be completed rapidly:
- Fix typos in UI text
- Update CSS classes or styling
- Simple component property changes
- Minor layout adjustments
- Update hardcoded values
- Quick accessibility fixes

## Model Choice

Uses **Claude Haiku** - a fast, cost-effective model perfect for simple changes.

## Examples

**Good use cases:**
- "Fix the button color on the login form"
- "Update the copyright year in the footer"
- "Change the placeholder text on the search input"
- "Fix the alignment on the nav menu"

**NOT for:**
- Complex refactors across multiple files (use `complex-refactoring` skill)
- Backend logic changes (use `backend-coding` skill)
- Performance optimizations requiring analysis

## How It Works

When you invoke this skill:
1. The system spawns an OpenCode worker with Claude Haiku
2. The worker receives your task description
3. Changes are made quickly and efficiently
4. You get results in seconds, not minutes

## Tips

- Be specific about which files/components to change
- Include before/after descriptions when possible
- Keep tasks focused - break larger changes into multiple quick tasks
