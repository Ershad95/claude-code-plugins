---
description: "Hash text with the Kama platform hashers (Password/Argon2id, InternalApiKey, Captcha, OTP, OldPassword, RefreshToken) so the result matches what Kama services compare against. Use when the user asks to hash a password, API key, OTP or token."
argument-hint: <plainText> [--type Password|OldPassword|InternalApiKey|Captcha|OTP|RefreshToken]
allowed-tools: Bash(*kama-*.exe:*), Bash(grep:*), Bash(sed:*), Bash(ls:*), AskUserQuestion, Read
---

Hash `$ARGUMENTS` using the `Kama.Security.Hash` package — the same library the Kama platform services use, so a
hash produced here is byte-for-byte what those services will compare against (for the deterministic types).

## Arguments

| Argument | Required | Default |
| --- | --- | --- |
| `plainText` | **yes** | — first positional argument; the text to hash |
| `--type` | no | — **asked interactively** when not supplied |

If `plainText` is missing, stop and ask for it — do not invent one.

## Step 1 — establish the hash type

Each hash type has its **own** `IKamaHashGenerator` implementation, registered as a keyed singleton under its
`HashType` value; there is no single default. So the type must be known before anything runs.

If the caller already passed `--type`, use it and skip the question. Otherwise ask with `AskUserQuestion`
(header `Hash type`, single-select). The enum has six values but the tool allows only four options, so offer the
four common ones and let `Other` carry the rest — say so in the question text:

| Option | Value | Algorithm |
| --- | --- | --- |
| `Password` | 100 | Argon2id (m=65536, t=3, p=1, 32 bytes) — **salted, so every run differs** |
| `InternalApiKey` | 200 | SHA-256, uppercase hex |
| `Captcha` | 300 | HMAC-SHA256 with the library's captcha key, base64 |
| `OTP` | 400 | HMAC-SHA256 with the library's OTP key, base64 |
| `OldPassword` | 101 | SHA-256, base64 — the legacy scheme; `Other` |
| `RefreshToken` | 500 | SHA-256, base64 — same output as `OldPassword`; `Other` |

The question text should mention that `OldPassword` and `RefreshToken` are available via `Other`. Accept a numeric
value (`100`, `500`) too — the runner parses either spelling.

## Step 2 — run

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/kama-hash.exe" "<plainText>" --type <HashType>
```

The runner is a prebuilt executable shipped with this plugin at `${CLAUDE_PLUGIN_ROOT}/bin/` (requires the .NET 10 runtime).

Quote the plain text if it contains spaces or shell metacharacters — passwords and API keys usually do.
`--list-types` prints the enum with its numeric values.

## Report

Print the hash verbatim, on its own line, with nothing around it the user would have to strip out. Say which hash
type was used. Do **not** echo the plain text back if it looks like a credential.

For `Password`, add one line noting the output is Argon2id with a random salt, so running the command again on the
same input gives a different string — that is expected, and verification is done by
`IKamaHashValidator.VerifyHashAsync`, not by comparing two hashes. The other five types are deterministic.

Failures are reported by the runner on stderr with a non-zero exit code — relay the message rather than retrying:

- `plainText is required.` — no positional argument was passed.
- `--type is required.` — Step 1 was skipped.
- `Unknown hash type '<x>'` — the name or number is not a `HashType` value.

Never write the plain text or the hash into a repo file unless the user asked for that specific edit.
