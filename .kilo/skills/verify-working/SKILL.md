---
name: verify-working
description: >-
  Verify that code changes work correctly by running the full verification
  pipeline: tests, build, lint. If frontend files changed, also verify the
  frontend visually using Playwright MCP and provide a video recording as
  evidence. Use this skill after making code changes or before finishing a task.
---

# Verify Working

This skill runs the complete verification pipeline for the monorepo and, when
frontend files are affected, performs an additional visual check in a real
browser using Playwright MCP.

## When to Use This Skill

Use this skill when:

- You have finished a coding task and need to confirm nothing is broken
- You are about to finish a task and want to provide verification evidence
- The user explicitly asks you to verify your work
- You want to check if frontend changes render correctly

## Prerequisites

- pnpm must be available
- The monorepo uses `turbo` for build/test/lint orchestration
- Playwright MCP browser tools are available in the environment

## Verification Steps

### Step 1: Run Static Checks

Run the full static verification pipeline. Execute them sequentially so output
is easy to read.

```bash
pnpm lint
pnpm build
pnpm test
```

If any step fails, stop the verification and report the failure details to the
user. Do not proceed to frontend checks until all three pass.

### Step 2: Detect Frontend Changes

Determine whether the current changes include frontend files. Use the
appropriate git command for the platform:

- **If there are uncommitted changes:**
  ```bash
  git diff --name-only
  git diff --cached --name-only
  ```
- **If working on a branch with commits:**
  ```bash
  git diff --name-only <base-branch>...HEAD
  ```

Consider a change "frontend" if any modified file path matches:
- `apps/web/**/*`
- `packages/*/src/**/*.{tsx,jsx,vue,css,scss,html}`
- Any shared UI or theme files

If no frontend files changed, skip to Step 5 and report success with the static
logs.

### Step 3: Start the Dev Server

Build the frontend app for production or start the dev server so Playwright can
navigate to it. Prefer the fastest reliable option:

- If `apps/web` has a preview script (e.g., `vite preview`), build then preview:
  ```bash
  pnpm --filter @lokfi/web run build
  pnpm --filter @lokfi/web run preview --port 4173 --host &
  ```
- Otherwise start the dev server:
  ```bash
  pnpm --filter @lokfi/web run dev --port 5173 --host &
  ```

Wait until the server prints a ready message, then note the URL (typically
`http://localhost:4173` or `http://localhost:5173`).

### Step 4: Verify Frontend with Playwright MCP

Use the Playwright MCP browser tools to perform a visual verification. The goal
is to provide concrete visual evidence that the app loads and key pages render.

**Video recording is available.** Prefer recording a video over taking static
screenshots, especially when verifying interactive flows or multiple routes.

#### 4a. Start Video Recording

Begin recording before opening the app. Provide a descriptive filename.

```
playwright_browser_start_video -> filename: verify-working-session
```

If `browser_start_video` is unavailable, fall back to screenshots.

#### 4b. Open the App and Verify Key Routes

Navigate to the running app and verify the affected routes. Add chapter markers
for clarity.

```
playwright_browser_navigate -> url: <app-url>
playwright_browser_wait_for -> time: 2
playwright_browser_video_chapter -> title: "Home"
```

Based on the changes, navigate to the affected routes. For each route:

```
playwright_browser_navigate -> url: <app-url>/<route>
playwright_browser_wait_for -> time: 2
playwright_browser_video_chapter -> title: "<Route Name>"
```

Relevant routes:
- Dashboard: `/dashboard`
- Transactions: `/transactions`
- Import: `/import`
- Rules: `/rules`
- Profile: `/profile`

If the change includes a specific component or modal, interact to open it
(click, fill, etc.) and add a chapter marker.

#### 4c. Check Console for Errors

```
playwright_browser_console_messages
```

Report any unexpected errors.

#### 4d. Stop Recording and Close the Browser

Stop the video recording to obtain the file path, then close the browser.

```
playwright_browser_stop_video
playwright_browser_close
```

If `browser_stop_video` is unavailable, the video may be saved automatically
when the browser closes. In that case, just run:

```
playwright_browser_close
```

Note the returned video file path for the summary.

### Step 5: Summarize Evidence

Provide a concise summary to the user containing:

1. **Static Checks:** Pass/fail for lint, build, and test
2. **Frontend Detection:** Whether frontend files were modified
3. **Visual Evidence:** Attach or reference the video file path (or screenshot
   filenames if video was unavailable)
4. **Console Errors:** Any unexpected errors observed during browser checks
5. **Verdict:** "All checks passed" or a list of remaining issues

## Example Summary

```
Verification Results
===================
- lint:   passed
- build:  passed
- test:   passed

Frontend changes detected in apps/web/src/pages/dashboard/...
Browser verification:
- Video recording: verify-working-session.webm
- Routes covered: Home, Dashboard, Transactions
- No console errors

Verdict: All checks passed.
```

## Notes

- If Playwright MCP is unavailable or the browser fails to launch, report the
  issue and fall back to stating that static checks passed but visual
  verification could not be completed.
- On Windows, use `Start-Process` or `cmd /c start` if backgrounding with `&`
  does not work in the current shell.
- Video files are saved in the current working directory by default. Reference
  the exact path returned by `browser_stop_video` in the summary.
- If `browser_start_video`/`browser_stop_video` are not available in the current
  Playwright MCP version, fall back to sequential screenshots and note the
  limitation.
