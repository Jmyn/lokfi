import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const wt = process.env.ZED_WORKTREE_ROOT
if (!wt) {
  console.error('ZED_WORKTREE_ROOT is not set')
  process.exit(1)
}

const output = execSync(`git -C "${wt}" worktree list`, { encoding: 'utf-8' })
const firstLine = output.split('\n')[0]
if (!firstLine) {
  console.error('No output from git worktree list')
  process.exit(1)
}
const main = firstLine.trim().split(' ')[0]
if (!main) {
  console.error('Could not determine main repo path')
  process.exit(1)
}

const src = path.join(main, 'apps', 'web', '.env')
const dst = path.join(wt, 'apps', 'web', '.env')

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dst)
}
