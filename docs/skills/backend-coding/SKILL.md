---
name: backend-coding
description: Use for backend development tasks including API endpoints, database operations, and business logic
model: anthropic/claude-sonnet-4-20250514
---

# Backend Coding Skill

## When to Use

Use this skill for backend development tasks requiring careful reasoning:
- Implement API endpoints and handlers
- Write database queries and migrations
- Add business logic and validation
- Create authentication/authorization code
- Build background jobs and workers
- Implement middleware and services

## Model Choice

Uses **Claude Sonnet** - balances speed with strong reasoning capabilities for backend logic.

## Examples

**Good use cases:**
- "Add a POST endpoint for user registration"
- "Implement password reset flow with email sending"
- "Add database indexes for the orders table"
- "Create a background job to process queued payments"
- "Add JWT authentication middleware"

**NOT for:**
- Simple frontend tweaks (use `frontend-quick-task` skill)
- Multi-file architecture changes (use `complex-refactoring` skill)

## How It Works

When you invoke this skill:
1. The system spawns an OpenCode worker with Claude Sonnet
2. The worker analyzes your backend architecture
3. Code is written with proper error handling and validation
4. Database changes include migration files

## Tips

- Provide context about your backend stack (Node.js, Python, Rust, etc.)
- Include relevant schema definitions or API contracts
- Mention any security considerations (authentication, input validation)
- Specify if you need tests included

## Best Practices

- Always validate inputs
- Handle errors gracefully
- Use transactions for multi-step database operations
- Log important operations
- Consider performance implications (indexes, N+1 queries)
