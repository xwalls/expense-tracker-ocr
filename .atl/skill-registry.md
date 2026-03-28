# Skill Registry — expense-tracker-ocr

Generated: 2026-03-27
Project: expense-tracker-ocr

## User Skills

| Skill | Trigger | Source |
|-------|---------|--------|
| expense-tracker | Expenses, receipts, OCR, categories, budgets | `~/.claude/skills/expense-tracker/SKILL.md` |
| judgment-day | "judgment day", adversarial review, dual review | `~/.claude/skills/judgment-day/SKILL.md` |
| branch-pr | Creating PRs, preparing changes for review | `~/.claude/skills/branch-pr/SKILL.md` |
| issue-creation | Creating GitHub issues, bug reports, feature requests | `~/.claude/skills/issue-creation/SKILL.md` |
| skill-creator | Creating new AI skills, documenting patterns | `~/.claude/skills/skill-creator/SKILL.md` |

## Project Conventions

| File | Location |
|------|----------|
| CLAUDE.md (root) | `/Users/xavier/repositories/Xavier/CLAUDE.md` |

## Compact Rules

### expense-tracker
- Use MCP tools: create_expense, list_expenses, list_categories, get_summary, process_receipt
- Always call list_categories before create_expense to resolve categoryId
- Present expenses in tabular format with 2 decimal places
- For receipts: OCR → confirm with user → create expense

### branch-pr
- Issue-first: every PR must reference a GitHub issue
- Follow conventional commits

### issue-creation
- Use GitHub issue templates when available
- Label appropriately (bug, feature, etc.)

### judgment-day
- Launch two blind judge sub-agents in parallel
- Synthesize findings, apply fixes, re-judge (max 2 iterations)
