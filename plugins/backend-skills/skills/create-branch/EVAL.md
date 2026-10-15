# Eval — create-branch

Every item below is pass/fail. Work through them in order before reporting the task done, and state the result:
a failed item means the work is unfinished, not a caveat to mention in passing. If an item genuinely does not
apply to this change, say why rather than skipping it silently.

1. The name matches `^(feature|fix|refactor|chore|docs|test|perf|hotfix)/[a-z0-9]+(-[a-z0-9]+)*$` and
   `git check-ref-format --branch <name>` succeeds.
2. The type fits the work (new behaviour → `feature/`, bug → `fix/`, same behaviour → `refactor/`, urgent
   production fix → `hotfix/`, `.claude`/config → `chore/`, …).
3. The description is lowercase kebab-case, about 2–4 words, neither vague (`update`, `changes`, `stuff`, `wip`)
   nor a sentence.
4. The description states the intent, not the implementation (no `controller`, `service`, `handler`,
   `add-new`, `functionality`), and names the module or capability as the code does — no Persian.
5. The name was checked free locally and on `origin`; no existing branch was reused, overwritten, renamed or
   deleted.
6. The base branch was the one the user named, or `main` for `hotfix/` and `development` otherwise (or the one
   the user chose when asked), taken from `origin/<base>` after a fetch when it exists.
7. The name and base were shown and the user confirmed them before `git switch -c`.
8. Uncommitted changes were reported before switching; nothing was stashed, reset or discarded.
9. `git branch --show-current` prints the new name, and nothing was pushed unless the user asked.
