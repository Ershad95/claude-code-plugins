---
name: create-branch
description: Creates a new git branch named <type>/<short-description> (feature, fix, refactor, chore, docs, test, perf, hotfix; lowercase kebab-case, short, intent not implementation) from the right base branch, after confirming the name. Use when asked to "create a branch", "start a new branch for X", "branch off for this fix", "name my branch". Never pushes unless asked.
argument-hint: "[what the work is about, optional base branch]"
model: sonnet
effort: low
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(git rev-parse:*), Bash(git fetch:*), Bash(git switch:*), Bash(git show-ref:*), Bash(git ls-remote:*), Bash(git log:*), Bash(git check-ref-format:*), AskUserQuestion
agent: general-purpose
---

# Create a branch

**Announce once, before any other tool call:** 🛠 skill: create-branch — checklist: `.claude/skills/create-branch/EVAL.md`

Create one new branch whose name says what the work is for. More good/bad names:
**`references/examples.md`**.

`$ARGUMENTS` describes the work (a feature, bug, spec section, ticket) and may name the base branch. With no
arguments, ask what the branch is for.

## 1. Inspect

```bash
git branch --show-current
git status --short
git branch -a
```

- Uncommitted changes travel with `git switch -c`. If there are any, say so and ask whether they belong on the
  new branch (or should be committed first with the `commit` skill). Never stash or discard them yourself.

## 2. Pick the base branch

- Use the base named in `$ARGUMENTS`.
- Otherwise: `hotfix/` branches start from `main`; everything else starts from `development`. This repo flows
  `development` → `release-vX.Y.Z` → `main`. If the current branch is a `release-*` branch (as it usually is) or
  another work branch, ask whether to branch from it or from `development`.
- Older branches here use a dash (`feature-company-inquiry-v2`). New ones use the slash form below.
- Run `git fetch origin <base>` and branch from `origin/<base>` when it exists, so the branch starts up to date.

## 3. Build the name

```
<type>/<short-description>
```

- **type** — exactly one of:

  | type | use for | example |
  |---|---|---|
  | `feature/` | new functionality | `feature/company-inquiry-v2` |
  | `fix/` | bug fixes | `fix/sms-credentials-encryption` |
  | `refactor/` | code restructuring | `refactor/sms-folder-structure` |
  | `chore/` | maintenance / config / `.claude` tooling | `chore/update-ef-core` |
  | `docs/` | documentation | `docs/tenant-resolution` |
  | `test/` | tests | `test/insert-letter-idempotency` |
  | `perf/` | performance improvements | `perf/person-inquiry-cache` |
  | `hotfix/` | urgent production fix | `hotfix/shahkar-timeout` |

- **Lowercase** — `feature/company-inquiry`, never `Feature/CompanyInquiry` or
  `FEATURE/Product-Registration`.
- **kebab-case** — words joined by `-`: `fix/invalid-company-status`, never
  `fix/invalid_company_status` or `fix/InvalidCompanyStatus`. Only `a-z`, `0-9`, `-`; no spaces, dots,
  underscores, leading/trailing or doubled `-`, and exactly one `/`.
- **Short but meaningful** — about 2–4 words. `feature/bulk-sms`, not `feature/update` (too vague) and
  not `feature/add-new-bulk-sms-sending-functionality-for-all-providers` (too verbose).
- **Intent, not implementation** — `feature/company-inquiry`, not
  `feature/add-new-controller-and-service`. Drop filler like `add`, `new`, `implement`, `functionality`,
  `endpoint`, `handler`.
- Name the module or capability in kebab-case, the way the code does (`inquiry`, `shahkar`, `gomrok`, `sms`,
  `automation`, `company-inquiry`). Translate Persian input; never put Persian or transliteration in a branch name.
  The `SabtAhval` folder is `inquiry` in code, so use `inquiry`.
- A ticket id, if the user gives one, goes at the start of the description: `fix/123-invalid-company-status`.

Check it matches `^(feature|fix|refactor|chore|docs|test|perf|hotfix)/[a-z0-9]+(-[a-z0-9]+)*$` and that
`git check-ref-format --branch <name>` succeeds.

Make sure the name is free:

```bash
git show-ref --verify --quiet refs/heads/<name>             # local
git ls-remote --exit-code --heads origin <name>             # remote
```

If it exists, propose a more specific name — don't reuse or overwrite the branch.

## 4. Confirm

Show the proposed name (with one or two alternatives when the intent is ambiguous) and the base branch, and ask
the user to confirm or adjust. If the user supplies their own name that breaks the rules, show the corrected
form and use it once they agree.

## 5. Create

```bash
git switch -c <name> origin/<base>     # or <base> when it has no remote
git branch --show-current
git log --oneline -1
```

- Don't push. Only if the user asks: `git push -u origin <name>`.
- Never delete, rename or reset another branch as part of this.

## 6. Report

State the new branch name, the base and its commit, and any uncommitted changes that came along.

**Done = `EVAL.md` (same folder) passes.**
