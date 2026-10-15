---
description: "Decrypt every #KamaEncryption# field in the API appsettings*/modules.* files for one environment (or all) and print them per file. Use when the user wants to read the real connection strings and credentials of Development, Staging or Production. Run from the API repo."
argument-hint: "[<Environment>|Base|All] [--key <base64-key>]"
allowed-tools: Bash(*kama-*.exe:*), Bash(grep:*), Bash(sed:*), Bash(ls:*), AskUserQuestion, Read
---

Decrypt every `#KamaEncryption#` value in the API's configuration files using `Kama.Security.Encryption`'s
**symmetric** decryption, so the user can read back connection strings, cache endpoints and broker credentials
without hand-feeding each ciphertext to `/kama-decryption`.

`$ARGUMENTS` may name the environment up front (any environment Step 1 discovers, plus `Base` and `All`) and may
carry `--key <base64-key>`. Anything not supplied is asked for in Step 2. Never guess an environment — if the
argument is absent or ambiguous, ask.

## Scope

The config files all live in `src/API/Kama.ExternalService.Api/`. Never work from a hardcoded list of filenames —
new modules and new environments get added, and a stale list silently skips them. A config file is any file in
that directory matching `appsettings*.json` or `modules.*.json`.

The environment is derived from the filename, not from a table: take the dot-separated segments of the name with
`.json` removed; if the last segment begins with an uppercase letter it *is* the environment
(`appsettings.Production` → `Production`, `modules.inquiry.Development` → `Development`), otherwise the file is
`Base` (`appsettings`, `modules.inquiry`). This holds for any module or environment name added later, because
module names are lowercase here and environment names are `PascalCase`.

Only files that actually contain a `#KamaEncryption#` value matter, and which ones do changes over time. Step 1 discovers that each run; never assume it.

## Step 1 — inventory what is encrypted

Before asking anything, scan so the question is built from what is on disk. The two globs below are the whole
inventory — they pick up any config file added since, so keep them as globs and never expand them into a list:

```bash
grep -Hno '"[^"]*"[[:space:]]*:[[:space:]]*"#KamaEncryption#[^"]*"' \
  src/API/Kama.ExternalService.Api/appsettings*.json \
  src/API/Kama.ExternalService.Api/modules.*.json \
  | sed 's/^\([^:]*\):\([0-9]*\):"/\1\t\2\t/; s/": *"/\t/; s/"$//'
```

That emits one tab-separated `file<TAB>line<TAB>fieldName<TAB>cipherText` row per encrypted field. Group the rows
by environment using the filename rule in Scope (uppercase last segment = that environment; otherwise `Base`) and
count them. The environments you offer in Step 2 are the ones this grouping actually produced.

Keep the `#KamaEncryption#` prefix on the cipher text — the `sed` above deliberately leaves it in place. Despite
`/kama-decryption` describing that prefix as optional, some values in these files fail with a
`FormatException` when it is stripped and decrypt correctly when it is kept (this was found in the Pesticide
backend; verify with one value here before generalizing). Never hand a prefix-stripped value to the runner here.

## Step 2 — ask which environment

Ask with `AskUserQuestion` (header `Environment`, single-select) unless `$ARGUMENTS` already named one. Build the
options from the Step 1 inventory, and put the field count and field names in each option's description so the
user is choosing between visible things, e.g. *"Production — 3 fields: Cache, Username,
Password"*. Offer at most four options; when more than three environments carry values, make the fourth
**All environments** and let the user reach a specific one via `Other`. Skip any environment with zero encrypted
fields rather than offering an empty choice.

The key is a second, usually silent question: config values are encrypted with the library's **default** key, so
decrypt with no `--key` unless the user passed one in `$ARGUMENTS`. Only ask about a key if a decryption then
fails with a padding error (see Failures), and never reuse a key the user has not named for this run.

## Step 3 — decrypt

The runner is the prebuilt `kama-decryption.exe` shipped with this plugin; invoke it once per value:

```bash
RUNNER="${CLAUDE_PLUGIN_ROOT}/bin/kama-decryption.exe"
"$RUNNER" "<cipherText>" --type SymmetricEncryption   # add --key "<base64-key>" only if the user supplied one
```

Always pass `--type SymmetricEncryption` — config-file values are symmetric, and the type is not detectable from
the ciphertext. Quote every cipher text: base64 routinely contains `+` and `/`, and connection strings contain `;`.

A shell loop over the Step 1 rows is the efficient shape here — read `file`, `line`, `field`, `cipher` per row and
print `file<TAB>field<TAB>plaintext`. Keep a failed row in the output as a failure rather than dropping it, and
don't abort the batch on the first error.

## Report

Print one table per file, in the order the fields appear in the file:

```
src/API/Kama.ExternalService.Api/modules.inquiry.Production.json
  Database            <plaintext>
  AttachmentDatabase  <plaintext>
```

Say which environment was decrypted and whether the default key or a supplied key was used; do **not** echo a
supplied key back. State the total decrypted and, if any, the total failed.

## Failures

The runner reports on stderr with a non-zero exit code — relay the message rather than retrying:

- `Decryption failed: CryptographicException: Padding is invalid…` — the value was encrypted with a non-default
  key, or not by this library. Same error for both causes; it is not a corrupted-input diagnosis. This is the one
  case where asking the user for a `--key` is warranted — ask, then re-run only the failed rows.
- `FormatException` — most often the `#KamaEncryption#` prefix was stripped from the value (see Step 1); otherwise
  the field is not valid base64 (truncated or hand-edited), or a supplied key is not a valid base64 AES key.

## Secrets

Everything this command prints is a secret — database connection strings with credentials, Redis endpoints,
RabbitMQ passwords. Print them for the user in the session and stop there: never write plaintext into a repo file,
a scratch file, a report artifact, or a commit; never send it to a subagent or an external service; and don't
carry it into a later tool call unless the user explicitly asks for that. If the user wants the output saved,
confirm the destination with them first.
