# Claude Code Instructions

## Shell Commands

Avoid compound shell commands (using `&&`, `||`, `;`, or pipes) whenever possible, especially when each individual command is already permitted in settings. Run each command as a separate tool call instead. This prevents permission prompts from triggering on compound expressions that would otherwise be auto-approved as individual commands.

## Git Commit Convention

Refer to [commit convention](.claude/commands/conventional-commit.md) for how to commit.
