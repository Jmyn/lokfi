# Claude Code Instructions

## Shell Commands

Avoid compound shell commands (using `&&`, `||`, `;`, or pipes) whenever possible, especially when each individual command is already permitted in settings. Run each command as a separate tool call instead. This prevents permission prompts from triggering on compound expressions that would otherwise be auto-approved as individual commands.

**Never use `cd <dir> && <command>` or `cd .. && git ...` patterns.** Instead:

- Use `git -C <dir> <subcommand>` to run git commands in a different directory (e.g. `git -C ../other-package status`)
- Use absolute paths in tool calls where applicable

## Git Commit Convention

Refer to [commit convention](.claude/commands/conventional-commit.md) for how to commit.
