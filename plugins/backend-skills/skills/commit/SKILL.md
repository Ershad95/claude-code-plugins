---
name: commit
description: Splits the working-tree changes into one commit per logical change and writes a Conventional Commit message for each (<type>(<scope>): <short description>, optional why-body), after showing the plan for approval. Use when asked to commit, "commit my changes", "split this into commits", "write the commit message". Never pushes.
argument-hint: "[optional: paths to limit to, or context for the messages]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git add:*), Bash(git commit:*), Bash(git restore --staged:*), Bash(git branch:*), Bash(git rev-parse:*), Read, Grep, Glob, AskUserQuestion
---

# Commit changes

Commit the current changes as **one commit per logical change**, each with a message that reads well in
`git log --oneline`. Example messages: **`references/examples.md`**. The format is the one used by the
Pesticide backend (`ppo/kama.ppo.pesticide`), adapted to this repo's modules.

This repo's older history is mostly `.` and free-form titles. Do not copy them. Only the newest commits
(`fix(sms): ...`) follow the convention below.

`$ARGUMENTS` may limit the work to some paths, or give context for the messages. With no arguments, consider
every staged, unstaged and untracked change.

## 1. Inspect

```bash
git branch --show-current
git status --short
git diff --stat
git diff --cached --stat
git log --oneline -15
```

- On `main`, stop and ask which branch to use. Never commit to `main` directly. Work branches here are
  `development`, `release-vX.Y.Z` and feature branches.
- Read the actual diff of every changed file (`git diff -- <path>`, and `Read` for untracked files). Messages
  come from what the code does, not from file names.
- Changes the user already staged are a hint about grouping, not a finished plan. Review them the same way.

## 2. Group the changes into commits

A commit is one logical change that would make sense to revert on its own. Keep together:

| Keep together | Why |
|---|---|
| One vertical slice: command/query, validator, handler, endpoint, request/response, URL/tag constants, DI registration | The slice doesn't build or work in part. |
| A new provider service, its `Fake*` sibling, its options class and the `modules.<name>*.json` keys | Every provider needs a fake, and options bind at startup. |
| A new credential field and its entry in `FieldsToEncrypt` (`Program.cs`) plus the encrypted value | Never commit a plain secret first and fix it later. |
| A new module's four `modules.<name>*.json` files, its `ModuleNames` entry and the `AddKamaModuleConfiguration` entry | Otherwise the section binds empty and startup throws. |
| A package bump spanning several `.csproj` files | One version move, one commit. |
| A change and the tests that cover it | One logical change. |

Split into separate commits:

- Unrelated features or fixes, even in the same module.
- Refactors and renames apart from behaviour changes.
- **Fake-data JSON** (`Files/FakeData/**`) apart from code changes.
- Formatting-only or line-ending-only changes apart from real changes.
- `.claude/` tooling and `docs/` apart from `src/` code.
- Config changes for one environment (`*.Staging.json`) apart from unrelated ones, unless they are the same change.

If one file has hunks belonging to two commits, keep the whole file in the commit it mostly belongs to and say so
in the plan. Interactive partial staging (`git add -p`) isn't available here.

**Leave out and list in the plan:** build output (`bin/`, `obj/`, `out/`), `*.user`, `TemplateEngineHost/`,
local settings (`settings.local.json`), scratch files, and anything that looks like a secret or personal file.
Ask about any file whose purpose you can't tell from the diff.

**Secrets check before every commit.** Look at the staged diff of any `appsettings*.json` / `modules*.json`.
`Username`, `Password` and `ConnectionStrings:*` values must be `#KamaEncryption#...`. A plaintext credential
means stop and tell the user. Note that `Gomrok:*` and `Magfa:*` credentials are not yet in `FieldsToEncrypt`.

## 3. Write each message

```
<type>(<scope>): <short description>

<optional: why / important context>
```

- **type**: exactly one of `feat`, `fix`, `refactor`, `test`, `docs`, `perf`, `build`, `ci`, `chore`:

  | type | use for |
  |---|---|
  | `feat` | new endpoint, provider, tenant, field, business rule |
  | `fix` | wrong behaviour corrected |
  | `refactor` | same behaviour, better structure or names |
  | `test` | tests only |
  | `docs` | `docs/`, README, comments only |
  | `perf` | faster or lighter with the same result |
  | `build` | `.csproj`, package versions, `Directory.Build.props`, SDK |
  | `ci` | `.gitlab-ci.yml`, `Dockerfile`, deployment templates |
  | `chore` | `.claude/` tooling, fake data, config, housekeeping |

- **scope**: the module or area in kebab-case: `inquiry` (the `SabtAhval` folder, where code says `Inquiry`),
  `shahkar`, `gomrok`, `sms`, `automation`, plus cross-cutting `api` (host, `Program.cs`, middleware), `common`
  (`src/Common`), `config`, `fake-data`, `ef`, `deps`, `skills`, `docs`. Reuse scopes already in `git log`.
  A change touching several modules uses the dominant one, or `common`/`api` if it is the shared part.
- **subject**: imperative ("add", "reject", "return"), lower-case, no trailing period, at most ~72 characters
  including type and scope. Say *what changed* for the API caller or the code, not how.
  Never: `update`, `changes`, `fix stuff`, `wip`, `.`.
- **body**: optional; wrap at 72 columns. Explain *why*. Required for:
  - business-rule or architectural changes (one line on the reasoning);
  - changes to upstream behaviour, such as a new gateway, tenant routing or timeout;
  - config a deployer must set (new `modules.*.json` keys, `ConnectionStrings:Database`, a DBA script);
  - breaking API changes: add `!` after the scope and end the body with `BREAKING CHANGE: ...`.
    Note that endpoints here return `Result<T>` as HTTP 200, so a changed `isSuccess`/`error` shape is breaking too.
- **Attribution:** if the session defines commit attribution trailers (a `Co-Authored-By:` line), add them as the
  last paragraph after the body.

## 4. Confirm the plan

Show the plan before committing anything. List the commits in order, each with its full message and file list,
then the files left out and why. Order commits so each one builds on its own (shared types and options before
the features that use them). Ask the user to confirm or adjust, and apply their changes to the plan.

## 5. Commit

For each commit, in order:

```bash
git restore --staged :/          # start from an empty index (first commit only)
git add -- <file> <file> ...     # explicit paths only. Never `git add -A` / `git add .`
git diff --cached --stat         # check the index holds exactly this commit's files
git commit -F - <<'EOF'
<type>(<scope>): <short description>

<body>
EOF
```

- No git hooks are installed in the repo. Instead `.claude/hooks/pre-commit-dispatch.sh` runs on Claude's own
  `git commit` calls and does two things: it **blocks** on build output, conflict markers, `Debugger.Break()` and plain
  values for fields in `FieldsToEncrypt` (it silently trims trailing whitespace and the EOF newline and re-stages
  those files). If it blocks, report its message and fix the cause. For plain secrets that means the
  `config-encryption-guard` agent. The escape hatch `KAMA_SKIP_CONFIG_ENCRYPTION_GATE=1` is for a deliberate plain
  value only, and you must ask the user first.
- Nothing runs the build or tests at commit time. If the change touches code and the user has not built it, say so in
  the report. Don't run a full build unless asked.
- Never use `--no-verify`, and never amend a commit that was already made. Create a new one.
- Don't push.

## 6. Report

```bash
git log --oneline -<number of commits made>
git status --short
```

Show the new commits and anything still uncommitted, with the reason it was left out.

**Done = `EVAL.md` (same folder) passes.**
