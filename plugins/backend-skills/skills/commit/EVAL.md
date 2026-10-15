# Eval — commit

Every item below is pass/fail. Work through them in order before reporting the task done, and state the result:
a failed item means the work is unfinished, not a caveat to mention in passing. If an item genuinely does not
apply to this change, say why rather than skipping it silently.

1. No commit was made on `main`, and nothing was pushed.
2. The plan (messages, file lists, left-out files) was shown and the user confirmed it before the first
   `git commit`.
3. Every file was staged by explicit path. No `git add -A`, `git add .` or `git commit -a`.
4. `git diff --cached --stat` was checked before each commit and held exactly that commit's files.
5. Each commit is one logical change: no unrelated features together, no refactor mixed with a behaviour change,
   no `.claude/` tooling or fake-data JSON mixed with `src/` code.
6. Files that belong together were not split: a slice with its endpoint/DI, a provider with its fake and options,
   a credential field with its `FieldsToEncrypt` entry, a new module with its four config files.
7. Every subject matches `^(feat|fix|refactor|test|docs|perf|build|ci|chore)\([a-z0-9-]+\)!?: [a-z].*[^.]$` and is
   at most ~72 characters (`git log --format=%s -<n>`).
8. No subject is vague (`update`, `changes`, `fix stuff`, `wip`, `.`), and each is imperative and says what
   changed, not how.
9. Business-rule, architectural, deployer-facing config and breaking changes have a body explaining why (and
   `BREAKING CHANGE:` where the API contract changed).
10. No `Username`, `Password` or connection string in a committed `appsettings*.json` / `modules*.json` is
    plaintext. Each is `#KamaEncryption#...`.
11. No hook was bypassed (`--no-verify`) and no existing commit was amended.
12. No scratch file, build output, local setting or secret was committed; everything left uncommitted was listed
    with a reason (`git status --short`).
