---
description: "Encrypt a plain-text value (connection string, password, secret) into a #KamaEncryption# ciphertext ready to paste into appsettings/modules config. Use when the user asks to encrypt a secret or config value; supports symmetric (default key) and asymmetric RSA."
argument-hint: <plainText> [--key <key|pem-path>] [--type SymmetricEncryption|ASymmetricEncryption]
allowed-tools: Bash(*kama-*.exe:*), Bash(grep:*), Bash(sed:*), Bash(ls:*), AskUserQuestion, Read
---

Encrypt `$ARGUMENTS` using the `Kama.Security.Encryption` package — the same library `Program.cs` wires up with
`AddKamaEncryptionService`, so the ciphertext this produces is exactly what the API will accept in
`modules*.json` / `appsettings*.json` for a `#KamaEncryption#` field.

## Arguments

| Argument | Required | Default |
| --- | --- | --- |
| `plainText` | **yes** | — first positional argument; the text to encrypt |
| `--type` | no | — **asked interactively** when not supplied |
| `--key` | no | — **asked interactively**; symmetric may decline, asymmetric may not |

If `plainText` is missing, stop and ask for it — do not invent one.

## Step 1 — establish the encryption type

Ask with `AskUserQuestion` (header `Encryption`, single-select), unless the caller already passed `--type`:

| Option | Interface call | Key |
| --- | --- | --- |
| `SymmetricEncryption` | `IKamaSymmetricEncryptionService.Encrypt(plainText, key?)` | base64 AES key, **optional** |
| `ASymmetricEncryption` | `IKamaAsymmetricEncryptionService.Encrypt(plainText, publicKey)` | PEM RSA public key, **required** |

`Symmetric` / `Asymmetric` are accepted spellings too. Symmetric is the normal case for config-file values.

## Step 2 — establish the key

**Symmetric** — ask with `AskUserQuestion` (header `Key`, single-select), and make clear that declining is fine
and is the usual answer:

- *Use the library's default key* — omit `--key` entirely. This is what the API uses for config-file encryption,
  so a value encrypted this way is readable by the running service.
- *Supply my own base64 AES key* — the user pastes it via `Other`. Must be valid base64 and a 128/192/256-bit key.

**Asymmetric** — a public key is mandatory; the interface has no default-key overload (RSA-2048, OAEP-SHA256).
Ask the user for it, offering:

- *Paste the PEM, or give a path to a `.pem` file* — via `Other`. A path is easier than PEM text with embedded
  newlines, and the runner accepts either.
- *Generate a fresh key pair first* — run `"${CLAUDE_PLUGIN_ROOT}/bin/kama-encryption.exe" --generate-keys`,
  show the user both keys, and tell them to store the **private** key safely; then encrypt with the public one.

Never guess or reuse a key the user has not named for this run.

## Step 3 — run

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/kama-encryption.exe" "<plainText>" --type <Type> [--key <key|pem-path>]
```

The runner is a prebuilt executable shipped with this plugin at `${CLAUDE_PLUGIN_ROOT}/bin/` (requires the .NET 10 runtime).

Quote the plain text if it contains spaces or shell metacharacters — connection strings and passwords usually do.

## Report

Print the ciphertext verbatim, on its own line, and nothing else around it that the user would have to strip out.
Output always carries the `#KamaEncryption#` prefix — that prefix is part of the value and must be kept when
pasting into a config file. Say which encryption type and which key were used (default key vs. supplied key);
do **not** echo a supplied key back.

Failures are reported by the runner on stderr with a non-zero exit code — relay the message rather than retrying:

- `ASymmetricEncryption requires --key…` — Step 2 was skipped on the asymmetric path.
- `FormatException` on the symmetric path — the supplied key is not valid base64, or not a 128/192/256-bit AES key.
- `Encryption failed: CryptographicException` on the asymmetric path — the PEM is not a valid RSA public key, or
  the plain text exceeds what a 2048-bit RSA/OAEP-SHA256 key can hold (~190 bytes).

Never write the plain text or the ciphertext into a repo file unless the user asked for that specific edit —
these values are secrets in every case this command is used for.
