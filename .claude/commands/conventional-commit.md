---
description: Review unstaged changes and construct atomic git commits using conventional commit convention
---

Perform the following steps carefully:

1. **Review Unstaged Changes**: Run `git status`, `git diff`, and `git diff --cached` to thoroughly analyze the current state of modified, deleted, or added files.

2. **Logically Group Changes**: Identify logical, highly cohesive boundaries between modified features. Strive to separate files such that a single commit solves one and only one problem. For instance, separate data model refactoring from documentation updates.

3. **Determine Conventional Commit Structure**: Based on the conventional commit specification, structure a commit message for each group.
   - Format: `<type>(scope): <description>`
   - Scope must match the package name — e.g. changes in `@lokfi/parser-core` → `feat(parser-core): ...`. If changes do not belong to any package, scope = `root`.
   - Common types: `feat` (new feature), `fix` (bug fix), `docs` (documentation), `style` (formatting), `refactor` (code refactoring), `test` (tests), `chore` (maintenance).
   - **Breaking changes**: If a change introduces a breaking API, interface, or behavioral change:
     - Append `!` after the type/scope: `feat(parser-core)!: remove legacy parse method`
     - Add a `BREAKING CHANGE:` footer in the commit body describing what broke and how to migrate:
       ```
       feat(parser-core)!: remove legacy parse method

       BREAKING CHANGE: `parse()` has been removed. Use `parseAsync()` instead.
       ```
     - Both `!` and the footer are required when a change is breaking — do not use one without the other.

4. **Preview Commits**: Present each atomic group with its proposed commit message to the user.

5. **Wait for Approval**: Wait for explicit user approval before executing any `git add` + `git commit` commands.
