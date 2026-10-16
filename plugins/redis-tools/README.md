# redis-tools

Stdio MCP server that lets Claude Code agents inspect (and, when allowed, change) a Redis instance.
It is read-only by default.

The server is pre-bundled into `server/dist/index.js`, so the plugin only needs **Node.js 20+**; no `npm install` on the target machine.

## Install

```text
/plugin marketplace add Ershad95/claude-code-plugins
/plugin install redis-tools@ershad-marketplace
```

## Configuration

The plugin's `.mcp.json` reads these from your environment (set them before starting Claude Code):

| Variable | Default | Meaning |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379/0` | Connection URL. `rediss://` for TLS. May include credentials: `redis://user:pass@host:6379/0` |
| `REDIS_USERNAME` / `REDIS_PASSWORD` | empty | Optional; override credentials in the URL |
| `REDIS_ALLOW_WRITES` | `0` | `1` registers the write tools and allows write commands through `redis_command` |
| `REDIS_TIMEOUT_MS` | `10000` | Per-command timeout (set in `.mcp.json` `env` if you need it) |

PowerShell, persistent for your user:

```powershell
[Environment]::SetEnvironmentVariable("REDIS_URL", "redis://redis.example.local:6379/0", "User")
[Environment]::SetEnvironmentVariable("REDIS_PASSWORD", "<password>", "User")
```

Restart Claude Code, then check `/mcp`: the server shows up as `plugin:redis-tools:redis`.

### More than one Redis (stage, prod, …)

The plugin gives you one server. For extra instances, register the same bundle again under another name:

```powershell
claude mcp add redis-stage --scope user `
  -e REDIS_URL=redis://stage-redis:6379/0 -e REDIS_PASSWORD=<password> `
  -- node "<plugin install path>/server/dist/index.js"
```

## Tools

Read-only (always on):

- `redis_info` — version, memory, clients, hit rate, evictions, replication, per-db key counts (`section` for raw INFO sections)
- `redis_scan_keys` — glob search with `SCAN` (never `KEYS`), optional type filter, cursor paging, optional type/TTL/memory per key
- `redis_get_key` — reads any type: string, hash, list, set, zset, stream (with consumer groups), RedisJSON; pages/truncates big values, parses JSON strings
- `redis_slowlog` — recent slow commands
- `redis_client_list` — connected clients
- `redis_config_get` — config values, passwords masked
- `redis_command` — raw command as an argument array; only allowlisted read commands unless writes are on

Every tool takes an optional `db` to target another logical database.

Write tools, only registered when `REDIS_ALLOW_WRITES=1`:

- `redis_set` — SET with optional TTL and NX/XX
- `redis_expire` — set TTL, or `0` to persist
- `redis_delete_keys` — explicit keys or a pattern; pattern mode is a dry run by default, real deletes need `confirm=true`, `*` is refused

Always refused, even with writes on: `FLUSHALL`, `FLUSHDB`, `KEYS`, `SHUTDOWN`, `DEBUG`, `MONITOR`, `SELECT`, subscribe and blocking pop commands.

## Development

```bash
cd server
npm install
npm run build   # rebuilds dist/index.js — commit it
```
