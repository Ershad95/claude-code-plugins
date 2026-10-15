---
name: push-and-watch-pipeline
description: Pushes the current branch to GitLab, then checks its pipeline every 5 minutes and plays a full-screen alarm for every job that finishes - green "Pipeline Completed" on success, red "Pipeline Failed" on failure/cancel - and an amber "Ready To Stage" alarm when the manual stage deploy is waiting. Use for "push and watch the pipeline", "push and alarm me", "push and tell me when it's ready for stage".
argument-hint: "[optional: branch to push, default = current branch]"
---

# Push and watch the pipeline

**Announce once, before any other tool call:** 🛠 skill: push-and-watch-pipeline — checklist: `.claude/skills/push-and-watch-pipeline/EVAL.md`

Alarm scripts (Windows PowerShell 5.1, paths relative to the repo root):

- `.claude\skills\push-and-watch-pipeline\scripts\alarm.ps1 -Kind Success|Error|Stage [-Message ...]` — one alarm
- `.claude\skills\push-and-watch-pipeline\scripts\play-alarms.ps1 "Kind|Message" ...` — several alarms, one after another

| Kind      | Colour | Default text          | Spoken                          |
|-----------|--------|-----------------------|---------------------------------|
| `Success` | green  | Pipeline Completed    | "Successful. Pipeline Completed"|
| `Error`   | red    | Pipeline Failed       | "Error. Pipeline Failed"        |
| `Stage`   | amber  | Ready To Stage        | "Ready To Stage"                |

## 1. Push

1. `git rev-parse --abbrev-ref HEAD` → the branch (or `$ARGUMENTS`). `git status --short` — if there are uncommitted
   changes, say so (they will not be pushed) and continue; do not commit them yourself (that is the `commit` skill).
2. **Never push `main`/`master`** unless the user explicitly named it in this request. **Never force-push.**
3. `git push` (or `git push -u origin <branch>` when there is no upstream). If the push is rejected, stop and report —
   do not pull/rebase on your own.
4. `git rev-parse HEAD` → the pushed SHA.

## 2. Find the pipeline

GitLab project: from `git remote get-url origin` (here `kama/kama.externalservices.api`, project id 324).

`mcp__gitlab__gitlab_list_pipelines` with `ref=<branch>`, `per_page=5` → the pipeline whose `sha` equals the pushed
SHA. It can take a few seconds to appear; if it is not there, the first 5-minute check picks it up. If no pipeline
exists after two checks, report that (the branch may not trigger CI) and stop the watch.

## 3. Watch every 5 minutes

Create a recurring job with `CronCreate`, cron `*/5 * * * *`, whose prompt is:

> Pipeline watch tick for `<project>` branch `<branch>` sha `<sha>`: follow step 3 of the push-and-watch-pipeline skill.

Keep a state file at `<scratchpad>/pipeline-watch-<sha8>.json`: `{ "pipelineId": ..., "announced": { "<jobId>": "<status>" }, "idleManualTicks": 0 }`.

On each tick:

1. `mcp__gitlab__gitlab_list_pipeline_jobs` for the pipeline (find the pipeline first if the state has no id yet).
2. For each job whose status is **not** already in `announced` with the same value:

   | Job status                                                             | Action                                                |
   |------------------------------------------------------------------------|-------------------------------------------------------|
   | `success`                                                              | `Success\|<job name>: Pipeline Completed`            |
   | `failed`, `canceled`                                                   | `Error\|<job name>: Pipeline Failed`                 |
   | `manual` on the **stage-deploy** stage (job `deploy-stage`, allow_failure) | `Stage\|Ready To Stage`                              |
   | `manual` on any other stage                                            | no alarm, just mention it                            |
   | `created`, `pending`, `preparing`, `waiting_for_resource`, `running`, `scheduled` | still running — no alarm, not announced    |
   | `skipped`                                                              | no alarm, record it                                   |

   Order the new alarms by the job's `finished_at` (manual last) and play them all in **one** call, in the background
   so the session is not blocked:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File ".claude\skills\push-and-watch-pipeline\scripts\play-alarms.ps1" "Success|build_artifact: Pipeline Completed" "Stage|Ready To Stage"
   ```

   (PowerShell tool, `run_in_background: true`.) Then record those jobs in `announced`.
3. Post one short line per tick: which jobs changed and to what, or "still running: <jobs>".
4. **Stop the watch** (`CronDelete`, and say so) when no job is in a running-type status **and** either
   - no job is `manual` (pipeline finished), or
   - a job is `manual` and `idleManualTicks` reaches 12 (one hour waiting for someone to click deploy) — increment it
     on every tick where only manual jobs remain; reset it to 0 when a job starts running again (someone clicked it,
     so its result will still get an alarm).
   Also stop on the first `failed` job in a non-`allow_failure` job once nothing is still running.

`CronCreate` jobs fire only while this Claude session is open and idle, and expire after 7 days — tell the user once
when starting the watch.

## 4. Report

When the watch stops: the pipeline link (`web_url`), each job with its final status, and whether stage is waiting
for a manual deploy.
