# Claude Code permissions policy

**Goal:** an efficient development loop without exposing the repository, connected accounts or paid Higgsfield operations. The policy lives in the committed `.claude/settings.json` and is enforced by `scripts/checks/claudeSettings.test.ts`, part of `npm run test`.

## Where permission rules come from (they combine)

| Source | File | In this repo / environment |
| --- | --- | --- |
| Project (shared, committed) | `.claude/settings.json` | **This policy** |
| Project local (personal, never committed) | `.claude/settings.local.json` | Git-ignored; absent by default |
| User | `~/.claude/settings.json` | Absent in the cloud container |
| Cloud launcher (platform-provided) | `~/.claude/launcher-settings.json` | Adds `allow: ["Skill"]` and a Stop hook that checks git state. Not controlled by this repo. |
| Managed / organization policy | `/etc/claude-code/managed-settings.json`, remote settings | Absent / empty |

`ask` rules force a confirmation prompt even if another source allows the action. A broader allow added elsewhere therefore cannot silently approve the operations listed under "Always asks".

**Cloud sessions:** per the platform documentation, cloud sessions perform file edits without prompting in every mode, and ignore `bypassPermissions` / `dontAsk`. `Edit` allow rules mainly affect local CLI use. The shell and MCP rules below apply everywhere.

## Allowed without a prompt

| Area | Rules |
| --- | --- |
| Project checks | `npm run test`, `typecheck`, `build`, `lint` (with arguments), `npm run design:generate`, `npx vitest run …`, `npx tsc -p …` |
| Read-only git | `git status`, `log`, `diff`, `show`, `ls-files`, `check-attr`, `rev-parse`, `branch --show-current/-a/-vv`, `remote -v` |
| File edits | `apps/**`, `packages/**`, `docs/**`, `scripts/**`, `assets/**` |
| Higgsfield (read-only) | `balance`, `list_workspaces`, `models_explore`, `transactions`, `get_preferences` |
| GitHub (read-only) | file contents, branches, commits, PRs, issues, code search, Actions runs and logs |

Reading files inside the project needs no rule; Claude Code allows it by default.

## Always asks

| Category | Examples |
| --- | --- |
| **Paid Higgsfield operations** | every `generate_*` tool (including cost preflights), presets, upscaling, background removal, outpaint, voice, AI-influencer, ads/shorts studio, 3D scene generation, analysis, media upload, workspace selection, website create/deploy/publish/secrets, TikTok publishing |
| Remote git | `git push` (any form), `git remote add/set-url/remove`, `git config` |
| Destructive git | `reset --hard`, `clean`, `branch -d/-D`, `rebase`, `commit --amend`, `tag -d`, `restore`, `checkout --` |
| Destructive files | `rm -r`, `rm -rf`, `rm -fr` |
| Deployment and publishing | `npm publish`, `vercel`, `netlify`, `flyctl`, `docker push` |
| Repository access and settings | `gh` (GitHub API client), GitHub MCP writes: merge, push or create files, create branch/repo/fork/PR, update PRs, auto-merge, Actions triggers, issues/comments/reviews |
| Remote sessions and schedules | adding repos, creating/archiving/interrupting sessions, creating/updating/deleting/firing routines, `send_later`, webhooks |
| Credentials | `env` / `printenv`; reading `.env*`, `~/.ssh`, `~/.aws`, `~/.netrc`, `~/.git-credentials`, `~/.npmrc`, `~/.config/gh`, `~/.claude/.credentials.json`, `~/.claude/remote/**`, `.higgsfield/`; editing `.env*` and `.claude/**` (so the policy cannot quietly change itself) |

Anything not listed (for example `git commit`, `npm install`, unlisted MCP tools) falls back to Claude Code's default behaviour, which prompts.

## Higgsfield

The integration stays connected. Generation always requires your approval twice: the `ask` rule produces a prompt, and the working rules in [credit-approval-checklist.md](../design/credit-approval-checklist.md) require your explicit go-ahead in chat before a batch is even proposed for execution.

## Personal overrides

Put machine-specific rules in `.claude/settings.local.json` (git-ignored, enforced by a test). Never put API keys or tokens in any settings file. Credentials belong in the environment's secret store or the tool's own credential storage.

```json
{
  "permissions": {
    "allow": ["Bash(npm run dev)"]
  }
}
```

## Known limits (honest)

- **Running tests executes project code.** Auto-approving `npm run test` together with edits under `packages/**` means a changed test or script runs without a separate prompt. That is inherent to running a test suite; the protection is code review of diffs before they're pushed (pushing always asks).
- **`Read` rules govern the Read tool.** Shell commands that read files are governed by Bash rules. Only the commands listed above are pre-approved; others prompt by default.
- **Rule matching follows Claude Code's documented syntax.** Bash prefix rules (`Bash(git log *)`) match commands starting with that prefix. Claude Code evaluates each part of compound shell commands separately.
- **History is public:** before this policy, `bf2c1ef` committed the Higgsfield credit balance and a shortened workspace identifier in a design doc. They are removed from the current files; removing them from history would need a history rewrite and force-push, which requires explicit approval.
