---
description: review unstaged changes and construct atomic git commits using conventional commit convention
---

When the user triggers this workflow, perform the following steps carefully:

1. **Review Unstaged Changes**: Use tools like `run_command` to execute `git status`, `git diff`, and `git diff --cached` to thoroughly analyze the current state of modified, deleted, or added files in the workspace.
2. **Logically Group Changes**: Identify logical, highly cohesive boundaries between modified features. Strive to separate files structurally such that a single commit solves one and only one problem. For instance, separate data model refactoring changes from documentation updates.
3. **Stage Changes**: Once atomic groups of changes are identified, selectively add those specific files via `git add <files...>`. Avoid dumping all changes into a single bulk commit.
4. **Determine Conventional Commit Structure**: Based on the conventional commit specification, structure a relevant `.msg` parameter for git.
   - Format: `<type>(scope): <description>`
   - scope must match the package name e.g. changes in @lokfi/parser-core -> feat(parser-core): new feature. if changes do not belong to any package, scope = root
   - Common types: `feat` (new feature), `fix` (bug fix), `docs` (documentation), `style` (formatting, missing semi colons, etc.), `refactor` (code refactoring), `test` (adding missing tests), `chore` (maintenance, build task).
5. **Preview Commit**: Present to the user the commits with each atomic group separately with its corresponding message`.
6. **Wait for Approval**: Wait for user approval before using executing the proposed commits with `git commit -m "<message>"
