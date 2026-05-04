---
name: session-end
description: |
  Review what was accomplished this session and update relevant docs, memory files, and TODOs.
  Examines conversation history, updates architecture docs, memory/rule files, and resolves completed TODOs.
metadata:
  author: lokfi
  version: "1.0.0"
  openclaw:
    requires:
      bins:
        - git
---

# Session End

Reviews the current session's work, updates project documentation and memory files, and resolves completed TODOs. Use at the end of a working session to keep project state consistent and documented.

## Workflow

Perform the following steps carefully:

1. **Review Session Progress**: Review the conversation history to understand the tasks completed and code changed during this session.

2. **Update Project Documents**: Identify relevant project documentation in `docs/` (architecture docs, setup guides, data schemas, etc.) and update any information that has become outdated based on recent changes.

3. **Update Memory Files**: Inspect memory and configuration files in `.claude/` (e.g. `MEMORY.md`, `RULES.md`, memory files under `.claude/projects/`). Update any rules, context, or definitions that reflect the new state of the project.

4. **Update TODOs**: Search the project for TODO items (in `TODO.md` or inline code comments). Mark as done or remove any that were completed this session.

5. **Summarize Session**: Provide a concise summary detailing what was accomplished, which documents and memory files were updated, and which TODOs were resolved.

## Rules

- Only update docs/memory that have actually changed — don't touch everything
- Mark TODOs as done, don't just delete them (preserves audit trail)
- The summary should be brief and factual, not a rehash of the conversation
