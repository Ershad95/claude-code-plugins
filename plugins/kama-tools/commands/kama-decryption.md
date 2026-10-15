---
description: "Decrypt a single #KamaEncryption# value back to plain text to read what a config secret contains. Use when the user pastes a ciphertext and asks what it is; supports symmetric (default key) and asymmetric RSA."
argument-hint: <cipherText> [--key <key|pem-path>] [--type SymmetricEncryption|ASymmetricEncryption]
allowed-tools: Bash(*kama-*.exe:*), Bash(grep:*), Bash(sed:*), Bash(ls:*), AskUserQuestion, Read
---

Decrypt `$ARGUMENTS` using the `Kama.Security.Encryption` package — the inverse of `/kama-encryption`, and the way
to read back a `#KamaEncryption#` value that the API wrote into `modules*.json` / `appsettings*.json`.

## Arguments

| Argument | Required | Default |
| --- | --- | --- |
| `cipherText` | **yes** | — first positional argument; the encrypted text |
| `--type` | no | — **asked interactively** when not supplied |
| `--key` | no | — **asked interactively**; symmetric may decline, asymmetric may not |

If `cipherText` is missing, stop and ask for it. The `#KamaEncryption#` prefix is optional in the input: the
library strips it itself, so a value pasted straight out of a config file works unchanged.

## Step 1 — establish the encryption type

Ask with `AskUserQuestion` (header `Encryption`, single-select), unless the caller already passed `--type`.
It must match how the value was **encrypted** — there is no way to detect it from the ciphertext:

| Option | Interface call | Key |
| --- | --- | --- |
| `SymmetricEncryption` | `IKamaSymmetricEncryptionService.Decrypt(cipherText, key?)` | base64 AES key, **optional** |
| `ASymmetricEncryption` | `IKamaAsymmetricEncryptionService.Decrypt(cipherText, privateKey)` | PEM RSA private key, **required** |

`Symmetric` / `Asymmetric` are accepted spellings too. A value read out of a config file is symmetric.

## Step 2 — establish the key

**Symmetric** — ask with `AskUserQuestion` (header `Key`, single-select), and make clear that declining is fine
and is the usual answer:

- *Use the library's default key* — omit `--key` entirely. Config-file values are encrypted with this key, so
  this is the right answer for anything pasted out of `modules*.json` / `appsettings*.json`.
- *Supply the base64 AES key it was encrypted with* — the user pastes it via `Other`. It has to be the same key
  used to encrypt; a wrong key fails with a padding error, not a wrong-plaintext.

**Asymmetric** — a private key is mandatory; the interface has no default-key overload. Ask the user to paste the
PEM or give a path to a `.pem` file (via `Other`) — a path is easier than PEM text with embedded newlines, and the
runner accepts either. It must be the pair of the public key that produced the value.

Never guess or reuse a key the user has not named for this run.

## Step 3 — run

```bash
"${CLAUDE_PLUGIN_ROOT}/bin/kama-decryption.exe" "<cipherText>" --type <Type> [--key <key|pem-path>]
```

The runner is a prebuilt executable shipped with this plugin at `${CLAUDE_PLUGIN_ROOT}/bin/` (requires the .NET 10 runtime).

Quote the cipher text — base64 output routinely contains `+` and `/`, and config values contain `;`.

## Report

Print the recovered plain text verbatim, on its own line. Say which encryption type and which key were used
(default key vs. supplied key); do **not** echo a supplied key back.

Failures are reported by the runner on stderr with a non-zero exit code — relay the message rather than retrying:

- `Decryption failed: CryptographicException: Padding is invalid…` — wrong symmetric key, or the value was not
  produced by this library. This is the same error for both causes; it is not a corrupted-input diagnosis.
- `FormatException` — the cipher text is not valid base64, or the supplied key is not a valid base64 AES key.
- `ASymmetricEncryption requires --key…` — Step 2 was skipped on the asymmetric path.
- `Decryption failed: CryptographicException` on the asymmetric path — the PEM is not a valid RSA private key, or
  it is not the pair of the public key that produced the value.

The output is by definition a secret — a connection string, a password, a RabbitMQ credential. Print it for the
user and stop there: never write it into a repo file, a scratch file, or a commit, and do not carry it into a
later tool call unless the user explicitly asks for that.
