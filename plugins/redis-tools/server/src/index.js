#!/usr/bin/env node
// Redis MCP server (stdio).
// Env: REDIS_URL (e.g. redis://host:6379/0, rediss://host:6380 for TLS)
//      REDIS_USERNAME, REDIS_PASSWORD (optional; override credentials in the URL)
//      REDIS_ALLOW_WRITES=1 to enable set / expire / delete tools and write commands (default: read-only)
//      REDIS_TIMEOUT_MS per-command timeout (default 10000)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "redis";
import { z } from "zod";

const REDIS_URL = process.env.REDIS_URL || "";
if (!REDIS_URL) {
  console.error("REDIS_URL is required");
  process.exit(1);
}
const USERNAME = process.env.REDIS_USERNAME || undefined;
const PASSWORD = process.env.REDIS_PASSWORD || undefined;
const ALLOW_WRITES = /^(1|true|yes)$/i.test(process.env.REDIS_ALLOW_WRITES || "");
const TIMEOUT_MS = Number(process.env.REDIS_TIMEOUT_MS) || 10000;
const SAFE_URL = REDIS_URL.replace(/\/\/[^@/]*@/, "//***@");

// One lazily-connected client per logical database, so a tool can target any db
// without SELECT racing on a shared connection. Nothing connects at startup, so the
// server still starts (and reports clear errors) when Redis is unreachable.
const clients = new Map();

async function client(db) {
  const key = db ?? "default";
  const cached = clients.get(key);
  if (cached) {
    const c = await cached.catch(() => null);
    if (c?.isReady) return c;
    clients.delete(key);
    c?.destroy?.();
  }
  const c = createClient({
    url: REDIS_URL,
    ...(USERNAME ? { username: USERNAME } : {}),
    ...(PASSWORD ? { password: PASSWORD } : {}),
    ...(db !== undefined ? { database: db } : {}),
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => (retries > 3 ? new Error("Redis unreachable, gave up reconnecting") : Math.min(retries * 250, 2000)),
    },
  });
  c.on("error", (e) => console.error(`redis[${key}] ${e.message}`));
  const pending = c.connect().then(() => c);
  clients.set(key, pending);
  try {
    return await pending;
  } catch (e) {
    clients.delete(key);
    throw new Error(`Cannot connect to ${SAFE_URL}${db !== undefined ? ` db ${db}` : ""}: ${e.message}`);
  }
}

async function cmd(db, args) {
  const c = await client(db);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${args[0]} timed out after ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
  });
  try {
    return await Promise.race([c.sendCommand(args.map(String)), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// --- command policy for redis_command -------------------------------------------------

// Never allowed: they wipe data, stop the server, hijack the connection, or block it.
const DENIED = new Set([
  "FLUSHALL", "FLUSHDB", "SHUTDOWN", "DEBUG", "MONITOR", "SYNC", "PSYNC", "REPLICAOF", "SLAVEOF",
  "SUBSCRIBE", "PSUBSCRIBE", "SSUBSCRIBE", "UNSUBSCRIBE", "PUNSUBSCRIBE", "SUNSUBSCRIBE",
  "SELECT", "SWAPDB", "QUIT", "RESET", "AUTH", "HELLO", "MULTI", "EXEC", "WATCH", "WAIT", "WAITAOF",
  "BLPOP", "BRPOP", "BLMOVE", "BRPOPLPUSH", "BLMPOP", "BZPOPMIN", "BZPOPMAX", "BZMPOP", "KEYS",
]);

const READ_ONLY = new Set([
  "PING", "ECHO", "TIME", "DBSIZE", "INFO", "ROLE", "LASTSAVE", "RANDOMKEY", "SCAN", "EXISTS", "TYPE",
  "TTL", "PTTL", "EXPIRETIME", "PEXPIRETIME", "TOUCH",
  "GET", "MGET", "STRLEN", "GETRANGE", "SUBSTR", "LCS", "BITCOUNT", "BITPOS", "GETBIT", "BITFIELD_RO",
  "HGET", "HMGET", "HLEN", "HKEYS", "HVALS", "HGETALL", "HEXISTS", "HSTRLEN", "HSCAN", "HRANDFIELD", "HTTL", "HPTTL",
  "LLEN", "LRANGE", "LINDEX", "LPOS",
  "SCARD", "SMEMBERS", "SISMEMBER", "SMISMEMBER", "SSCAN", "SRANDMEMBER", "SINTER", "SINTERCARD", "SUNION", "SDIFF",
  "ZCARD", "ZRANGE", "ZRANGEBYSCORE", "ZRANGEBYLEX", "ZREVRANGE", "ZREVRANGEBYSCORE", "ZREVRANGEBYLEX", "ZSCORE",
  "ZMSCORE", "ZRANK", "ZREVRANK", "ZCOUNT", "ZLEXCOUNT", "ZSCAN", "ZRANDMEMBER", "ZINTER", "ZUNION", "ZDIFF", "ZINTERCARD",
  "XLEN", "XRANGE", "XREVRANGE", "XPENDING",
  "PFCOUNT", "GEOPOS", "GEODIST", "GEOHASH", "GEOSEARCH", "GEORADIUS_RO", "GEORADIUSBYMEMBER_RO",
  "JSON.GET", "JSON.MGET", "JSON.TYPE", "JSON.OBJKEYS", "JSON.OBJLEN", "JSON.ARRLEN", "JSON.STRLEN", "JSON.RESP",
  "FT._LIST", "FT.INFO", "FT.SEARCH", "FT.AGGREGATE", "FT.EXPLAIN", "FT.PROFILE",
]);

// Container commands: only these subcommands are read-only.
const READ_ONLY_SUB = {
  CONFIG: ["GET"],
  CLIENT: ["LIST", "INFO", "GETNAME", "ID"],
  MEMORY: ["USAGE", "STATS", "DOCTOR", "MALLOC-STATS"],
  OBJECT: ["ENCODING", "FREQ", "IDLETIME", "REFCOUNT"],
  SLOWLOG: ["GET", "LEN"],
  LATENCY: ["LATEST", "HISTORY", "DOCTOR"],
  PUBSUB: ["CHANNELS", "NUMSUB", "NUMPAT", "SHARDCHANNELS", "SHARDNUMSUB"],
  XINFO: ["STREAM", "GROUPS", "CONSUMERS"],
  CLUSTER: ["INFO", "NODES", "SLOTS", "SHARDS", "MYID", "KEYSLOT", "COUNTKEYSINSLOT"],
  COMMAND: ["COUNT", "INFO", "DOCS", "GETKEYS"],
  FUNCTION: ["LIST", "STATS"],
  ACL: ["WHOAMI", "CAT"],
};

function checkCommand(args) {
  const name = String(args[0]).toUpperCase();
  const sub = args[1] !== undefined ? String(args[1]).toUpperCase() : "";
  if (name === "KEYS") throw new Error("KEYS blocks the server on large databases. Use redis_scan_keys instead.");
  if (DENIED.has(name)) throw new Error(`${name} is never allowed through this tool.`);
  if (ALLOW_WRITES) return;
  if (READ_ONLY.has(name)) return;
  if (READ_ONLY_SUB[name]?.includes(sub)) return;
  throw new Error(
    `${name}${sub && READ_ONLY_SUB[name] ? ` ${sub}` : ""} is not on the read-only allowlist. Set REDIS_ALLOW_WRITES=1 to allow write commands.`
  );
}

// --- helpers --------------------------------------------------------------------------

function parseInfo(text) {
  const out = {};
  let section = "general";
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      section = line.slice(1).trim().toLowerCase();
      out[section] = {};
      continue;
    }
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i);
    const v = line.slice(i + 1);
    // keyspace lines look like db0:keys=1,expires=0,avg_ttl=0
    out[section] ??= {};
    out[section][k] = /^[\w-]+=/.test(v) && v.includes(",")
      ? Object.fromEntries(v.split(",").map((kv) => kv.split("=")))
      : v;
  }
  return out;
}

const pairs = (flat) => {
  const o = {};
  for (let i = 0; i + 1 < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
};

const maybeJson = (s) => {
  if (typeof s !== "string" || !/^\s*[[{]/.test(s)) return { value: s };
  try {
    return { value: JSON.parse(s), value_format: "json" };
  } catch {
    return { value: s };
  }
};

// Walks a *SCAN cursor until `limit` items are collected or the collection ends.
async function scanCollect(db, command, key, limit) {
  const items = [];
  let cursor = "0";
  do {
    const [next, batch] = await cmd(db, [command, key, cursor, "COUNT", 500]);
    cursor = next;
    items.push(...batch);
  } while (cursor !== "0" && items.length < limit);
  return { items, complete: cursor === "0" };
}

const ok = (data) => ({
  content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
});
const fail = (e) => ({ content: [{ type: "text", text: `Error: ${e.message}` }], isError: true });
const tool = (fn) => async (args) => {
  try {
    return ok(await fn(args ?? {}));
  } catch (e) {
    return fail(e);
  }
};

const server = new McpServer({ name: "redis", version: "1.0.0" });

const dbArg = z.number().int().min(0).optional().describe("Logical database index. Omit to use the db from REDIS_URL (usually 0).");

// --- read tools -----------------------------------------------------------------------

server.registerTool(
  "redis_info",
  {
    title: "Server info",
    description:
      "Redis INFO parsed into an object: version, uptime, memory, clients, hit/miss stats, replication and per-db key counts (keyspace).",
    inputSchema: {
      section: z
        .string()
        .optional()
        .describe('One INFO section, e.g. "memory", "stats", "keyspace", "replication", "persistence", "all". Omit for a summary.'),
    },
  },
  tool(async ({ section }) => {
    if (section) return parseInfo(await cmd(undefined, ["INFO", section]));
    const info = parseInfo(await cmd(undefined, ["INFO"]));
    const s = info.server ?? {}, m = info.memory ?? {}, st = info.stats ?? {}, cl = info.clients ?? {};
    const hits = Number(st.keyspace_hits || 0), misses = Number(st.keyspace_misses || 0);
    return {
      server: { redis_version: s.redis_version, redis_mode: s.redis_mode, os: s.os, uptime_in_days: s.uptime_in_days, tcp_port: s.tcp_port },
      clients: { connected_clients: cl.connected_clients, blocked_clients: cl.blocked_clients, maxclients: cl.maxclients },
      memory: {
        used_memory_human: m.used_memory_human,
        used_memory_peak_human: m.used_memory_peak_human,
        maxmemory_human: m.maxmemory_human,
        maxmemory_policy: m.maxmemory_policy,
        mem_fragmentation_ratio: m.mem_fragmentation_ratio,
      },
      stats: {
        total_commands_processed: st.total_commands_processed,
        instantaneous_ops_per_sec: st.instantaneous_ops_per_sec,
        keyspace_hits: hits,
        keyspace_misses: misses,
        hit_rate: hits + misses ? `${((hits / (hits + misses)) * 100).toFixed(1)}%` : null,
        expired_keys: st.expired_keys,
        evicted_keys: st.evicted_keys,
        rejected_connections: st.rejected_connections,
      },
      replication: info.replication,
      persistence: info.persistence
        ? { rdb_last_bgsave_status: info.persistence.rdb_last_bgsave_status, aof_enabled: info.persistence.aof_enabled }
        : undefined,
      keyspace: info.keyspace ?? {},
    };
  })
);

server.registerTool(
  "redis_scan_keys",
  {
    title: "Scan keys",
    description:
      "Finds keys matching a glob pattern with SCAN (non-blocking, safe on production). Optionally adds type, TTL and memory per key. Returns next_cursor to continue.",
    inputSchema: {
      pattern: z.string().default("*").describe('Glob pattern, e.g. "user:*", "session:??:*", "*cache*".'),
      type: z
        .enum(["string", "hash", "list", "set", "zset", "stream", "ReJSON-RL"])
        .optional()
        .describe("Only keys of this type."),
      db: dbArg,
      limit: z.number().int().min(1).max(1000).default(100).describe("Max keys returned."),
      cursor: z.string().default("0").describe("Cursor from a previous call's next_cursor."),
      with_details: z.boolean().default(false).describe("Add type, ttl_seconds (-1 = no expiry) and memory_bytes per key."),
      max_scan_steps: z.number().int().min(1).max(1000).default(200).describe("SCAN round trips before stopping (each looks at ~1000 keys)."),
    },
  },
  tool(async ({ pattern, type, db, limit, cursor, with_details, max_scan_steps }) => {
    limit ??= 100;
    const keys = [];
    let cur = cursor ?? "0";
    let steps = 0;
    do {
      const args = ["SCAN", cur, "MATCH", pattern ?? "*", "COUNT", 1000];
      if (type) args.push("TYPE", type);
      const [next, batch] = await cmd(db, args);
      cur = next;
      keys.push(...batch);
      steps++;
    } while (cur !== "0" && keys.length < limit && steps < (max_scan_steps ?? 200));

    const page = [...new Set(keys)].slice(0, limit);
    const result = {
      returned: page.length,
      complete: cur === "0",
      next_cursor: cur === "0" ? null : cur,
      note: cur === "0" ? undefined : "More keys may match. Call again with cursor=next_cursor.",
    };
    if (!with_details) return { ...result, keys: page };

    const details = await Promise.all(
      page.map(async (key) => {
        const [t, ttl, mem] = await Promise.all([
          cmd(db, ["TYPE", key]),
          cmd(db, ["TTL", key]),
          cmd(db, ["MEMORY", "USAGE", key]).catch(() => null),
        ]);
        return { key, type: t, ttl_seconds: ttl, memory_bytes: mem };
      })
    );
    return { ...result, keys: details };
  })
);

server.registerTool(
  "redis_get_key",
  {
    title: "Read key",
    description:
      "Reads any key whatever its type (string, hash, list, set, zset, stream, RedisJSON) with TTL, encoding and size. Large values are paged/truncated. JSON strings are returned parsed.",
    inputSchema: {
      key: z.string(),
      db: dbArg,
      limit: z.number().int().min(1).max(5000).default(100).describe("Max elements for hash/list/set/zset/stream."),
      offset: z.number().int().min(0).default(0).describe("Start index for list and zset."),
      max_chars: z.number().int().min(100).max(500000).default(20000).describe("Max characters returned for string values."),
    },
  },
  tool(async ({ key, db, limit, offset, max_chars }) => {
    limit ??= 100;
    offset ??= 0;
    max_chars ??= 20000;
    const type = await cmd(db, ["TYPE", key]);
    if (type === "none") return { key, exists: false };
    const [ttl, encoding, memory] = await Promise.all([
      cmd(db, ["TTL", key]),
      cmd(db, ["OBJECT", "ENCODING", key]).catch(() => null),
      cmd(db, ["MEMORY", "USAGE", key]).catch(() => null),
    ]);
    const meta = { key, exists: true, type, ttl_seconds: ttl, encoding, memory_bytes: memory };

    switch (type) {
      case "string": {
        const length = await cmd(db, ["STRLEN", key]);
        const value = await cmd(db, ["GETRANGE", key, 0, max_chars - 1]);
        const truncated = length > max_chars;
        return { ...meta, length, truncated, ...(truncated ? { value } : maybeJson(value)) };
      }
      case "hash": {
        const length = await cmd(db, ["HLEN", key]);
        if (length <= limit) return { ...meta, length, truncated: false, value: pairs(await cmd(db, ["HGETALL", key])) };
        const { items } = await scanCollect(db, "HSCAN", key, limit * 2);
        return { ...meta, length, truncated: true, value: pairs(items.slice(0, limit * 2)) };
      }
      case "list": {
        const length = await cmd(db, ["LLEN", key]);
        const value = await cmd(db, ["LRANGE", key, offset, offset + limit - 1]);
        return { ...meta, length, offset, truncated: offset + value.length < length, value: value.map((v) => maybeJson(v).value) };
      }
      case "set": {
        const length = await cmd(db, ["SCARD", key]);
        if (length <= limit) return { ...meta, length, truncated: false, value: await cmd(db, ["SMEMBERS", key]) };
        const { items } = await scanCollect(db, "SSCAN", key, limit);
        return { ...meta, length, truncated: true, value: items.slice(0, limit) };
      }
      case "zset": {
        const length = await cmd(db, ["ZCARD", key]);
        const flat = await cmd(db, ["ZRANGE", key, offset, offset + limit - 1, "WITHSCORES"]);
        const value = [];
        for (let i = 0; i + 1 < flat.length; i += 2) value.push({ member: flat[i], score: Number(flat[i + 1]) });
        return { ...meta, length, offset, truncated: offset + value.length < length, value };
      }
      case "stream": {
        const length = await cmd(db, ["XLEN", key]);
        const entries = await cmd(db, ["XREVRANGE", key, "+", "-", "COUNT", limit]);
        const groups = await cmd(db, ["XINFO", "GROUPS", key]).catch(() => []);
        return {
          ...meta,
          length,
          note: "Newest entries first.",
          truncated: entries.length < length,
          consumer_groups: groups.map(pairs),
          value: entries.map(([id, fields]) => ({ id, fields: pairs(fields) })),
        };
      }
      case "ReJSON-RL":
        return { ...meta, ...maybeJson(await cmd(db, ["JSON.GET", key])) };
      default:
        return { ...meta, note: `Type ${type} is not decoded here. Use redis_command for type-specific reads.` };
    }
  })
);

server.registerTool(
  "redis_slowlog",
  {
    title: "Slow log",
    description: "Recent slow commands (SLOWLOG GET) with duration, arguments and client.",
    inputSchema: { count: z.number().int().min(1).max(128).default(20) },
  },
  tool(async ({ count }) => {
    const entries = await cmd(undefined, ["SLOWLOG", "GET", count ?? 20]);
    return entries.map(([id, ts, micros, args, client, name]) => ({
      id,
      at: new Date(Number(ts) * 1000).toISOString(),
      duration_ms: Number(micros) / 1000,
      command: args.join(" ").slice(0, 500),
      client,
      client_name: name,
    }));
  })
);

server.registerTool(
  "redis_client_list",
  {
    title: "List clients",
    description: "Connected clients (CLIENT LIST) with address, name, db, idle time and last command. Sorted by idle time.",
    inputSchema: { limit: z.number().int().min(1).max(1000).default(100) },
  },
  tool(async ({ limit }) => {
    const text = await cmd(undefined, ["CLIENT", "LIST"]);
    const rows = String(text)
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => Object.fromEntries(line.split(" ").map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)])))
      .map((c) => ({ id: c.id, addr: c.addr, name: c.name, user: c.user, db: c.db, age_s: Number(c.age), idle_s: Number(c.idle), cmd: c.cmd, flags: c.flags }));
    rows.sort((a, b) => a.idle_s - b.idle_s);
    return { total: rows.length, clients: rows.slice(0, limit ?? 100) };
  })
);

server.registerTool(
  "redis_config_get",
  {
    title: "Config get",
    description: "Server configuration values (CONFIG GET). Passwords are masked. Often disabled on managed Redis.",
    inputSchema: { pattern: z.string().default("*").describe('Glob, e.g. "maxmemory*", "save", "*timeout*".') },
  },
  tool(async ({ pattern }) => {
    const cfg = pairs(await cmd(undefined, ["CONFIG", "GET", pattern ?? "*"]));
    for (const k of Object.keys(cfg)) if (/pass|auth/i.test(k) && cfg[k]) cfg[k] = "***";
    return cfg;
  })
);

server.registerTool(
  "redis_command",
  {
    title: "Raw command",
    description:
      "Escape hatch: runs any Redis command the other tools do not cover, as an argument array. Read-only commands only unless writes are enabled. FLUSHALL/FLUSHDB/KEYS/blocking commands are always refused.",
    inputSchema: {
      command: z.array(z.string()).min(1).describe('Command and arguments, e.g. ["HGET", "user:1", "email"] or ["XINFO", "STREAM", "orders"].'),
      db: dbArg,
    },
  },
  tool(async ({ command, db }) => {
    checkCommand(command);
    const result = await cmd(db, command);
    return result ?? "(nil)";
  })
);

// --- write tools ----------------------------------------------------------------------

if (ALLOW_WRITES) {
  server.registerTool(
    "redis_set",
    {
      title: "Set string key",
      description: "Sets a string key (SET), optionally with a TTL and NX/XX condition.",
      inputSchema: {
        key: z.string(),
        value: z.string(),
        ttl_seconds: z.number().int().min(1).optional().describe("Expire after this many seconds."),
        condition: z.enum(["always", "nx", "xx"]).default("always").describe("nx = only if missing, xx = only if it exists."),
        db: dbArg,
      },
    },
    tool(async ({ key, value, ttl_seconds, condition, db }) => {
      const args = ["SET", key, value];
      if (ttl_seconds) args.push("EX", ttl_seconds);
      if (condition === "nx") args.push("NX");
      if (condition === "xx") args.push("XX");
      const res = await cmd(db, args);
      return { key, written: res === "OK", note: res === "OK" ? undefined : "Condition not met, nothing written." };
    })
  );

  server.registerTool(
    "redis_expire",
    {
      title: "Set or remove TTL",
      description: "Sets a key's TTL in seconds, or removes it (PERSIST) when ttl_seconds is 0.",
      inputSchema: { key: z.string(), ttl_seconds: z.number().int().min(0), db: dbArg },
    },
    tool(async ({ key, ttl_seconds, db }) => {
      const res = ttl_seconds === 0 ? await cmd(db, ["PERSIST", key]) : await cmd(db, ["EXPIRE", key, ttl_seconds]);
      return { key, applied: res === 1, ttl_seconds: await cmd(db, ["TTL", key]) };
    })
  );

  server.registerTool(
    "redis_delete_keys",
    {
      title: "Delete keys",
      description:
        "DESTRUCTIVE: deletes explicit keys, or every key matching a pattern. Pattern deletes are a dry run unless dry_run=false, and real deletes need confirm=true.",
      inputSchema: {
        keys: z.array(z.string()).max(1000).optional().describe("Exact keys to delete."),
        pattern: z.string().optional().describe('Glob pattern, e.g. "cache:user:42:*". "*" alone is refused.'),
        db: dbArg,
        dry_run: z.boolean().default(true).describe("Pattern mode: only report what would be deleted."),
        confirm: z.boolean().default(false).describe("Must be true to actually delete."),
        max_keys: z.number().int().min(1).max(100000).default(10000).describe("Pattern mode: refuse if more keys than this match."),
      },
    },
    tool(async ({ keys, pattern, db, dry_run, confirm, max_keys }) => {
      if (!keys?.length && !pattern) throw new Error("Pass keys or pattern.");
      if (keys?.length && pattern) throw new Error("Pass keys or pattern, not both.");
      let targets = keys ?? [];
      if (pattern) {
        if (/^\**$/.test(pattern.trim())) throw new Error('Refusing to delete with pattern "*".');
        const found = new Set();
        let cur = "0";
        do {
          const [next, batch] = await cmd(db, ["SCAN", cur, "MATCH", pattern, "COUNT", 1000]);
          cur = next;
          batch.forEach((k) => found.add(k));
          if (found.size > (max_keys ?? 10000)) throw new Error(`More than ${max_keys} keys match ${pattern}. Narrow the pattern or raise max_keys.`);
        } while (cur !== "0");
        targets = [...found];
        if (dry_run !== false) return { dry_run: true, pattern, would_delete: targets.length, sample: targets.slice(0, 50) };
      }
      if (confirm !== true) throw new Error(`Refusing to delete ${targets.length} key(s): pass confirm=true.`);
      let deleted = 0;
      for (let i = 0; i < targets.length; i += 500) deleted += await cmd(db, ["UNLINK", ...targets.slice(i, i + 500)]);
      return { deleted, requested: targets.length };
    })
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`redis mcp ready for ${SAFE_URL} (writes ${ALLOW_WRITES ? "enabled" : "disabled"})`);

const shutdown = async () => {
  for (const p of clients.values()) (await p.catch(() => null))?.destroy?.();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.on("close", shutdown);
