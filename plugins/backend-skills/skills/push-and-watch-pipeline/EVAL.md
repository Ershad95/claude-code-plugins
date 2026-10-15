# Eval — push-and-watch-pipeline

Every item is pass/fail; a failed item means the work is unfinished.

1. `main`/`master` was not pushed unless the user named it; nothing was force-pushed; a rejected push was reported, not "fixed" by pull/rebase.
2. The watched pipeline's `sha` equals the pushed `HEAD` SHA.
3. A `*/5 * * * *` CronCreate job was created, and the user was told it only runs while this session is open (7-day expiry).
4. Every job that reached `success` got exactly one green alarm; every `failed`/`canceled` job got exactly one red alarm — no repeats on later ticks.
5. The `deploy-stage` job reaching `manual` produced exactly one amber "Ready To Stage" alarm.
6. Alarms of one tick played one after another in the background (play-alarms.ps1), not overlapping and not blocking the session.
7. The cron job was deleted when the watch ended, and the final report lists the pipeline link and each job's final status.
