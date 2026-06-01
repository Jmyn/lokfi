---
name: "source-command-review-session"
description: "Review what was accomplished this session and update relevant docs, memory files, and TODOs"
---

# source-command-review-session

Use this skill when the user asks to run the migrated source command `review-session`.

## Command Template

Perform the following steps carefully:

1. **Review Session Progress**: Review the conversation history to understand the tasks completed and code changed during this session.

2. **Update Project Documents**: Identify relevant project documentation in `docs/` (architecture docs, setup guides, data schemas, etc.) and update any information that has become outdated based on recent changes.

3. **Update Memory Files**: Inspect memory and configuration files in `.Codex/` (e.g. `MEMORY.md`, `RULES.md`, memory files under `.Codex/projects/`). Update any rules, context, or definitions that reflect the new state of the project.

4. **Update TODOs**: Search the project for TODO items (in `TODO.md` or inline code comments). Mark as done or remove any that were completed this session.

5. **Summarize Session**: Provide a concise summary detailing what was accomplished, which documents and memory files were updated, and which TODOs were resolved.
