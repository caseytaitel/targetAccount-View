/**
 * App-side account state: Tier, Outreach Ownership, Outreach Status, Revisit date.
 * Lives in Upstash Redis, one hash per company (`ta:co:{id}`), and is NEVER written to
 * HubSpot. Moving it into HubSpot properties is the flagged next step in README.md.
 *
 * Per-field HSET means two people editing different fields of the same account at
 * the same moment cannot clobber each other.
 *
 * Without Redis env vars, development falls back to an in-memory store (lost on restart)
 * so the app runs locally; production refuses to start without Redis.
 */

import { Redis } from "@upstash/redis";

import { OUTREACH_OWNERS, OUTREACH_STATUSES, TIERS } from "./config";

export const STATE_FIELDS = ["tier", "outreach_owner", "outreach_status", "revisit_on"] as const;
export type StateField = (typeof STATE_FIELDS)[number];

export type AccountState = Partial<Record<StateField, string>> & {
  updated_by?: string;
  updated_at?: string;
};

const ALLOWED: Record<Exclude<StateField, "revisit_on">, readonly string[]> = {
  tier: TIERS,
  outreach_owner: OUTREACH_OWNERS,
  outreach_status: OUTREACH_STATUSES,
};

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Validates one field update. An empty string clears the field.
 */
export function parseStateUpdate(
  body: unknown,
): { ok: true; field: StateField; value: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const extra = Object.keys(body).filter((k) => k !== "field" && k !== "value");
  if (extra.length) {
    return { ok: false, error: `Unexpected field(s): ${extra.join(", ")}` };
  }
  const { field, value } = body as Record<string, unknown>;
  if (typeof field !== "string" || !(STATE_FIELDS as readonly string[]).includes(field)) {
    return { ok: false, error: "Unknown field." };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "Value must be a string." };
  }
  if (value === "") {
    return { ok: true, field: field as StateField, value };
  }
  if (field === "revisit_on") {
    return isIsoDate(value) ? { ok: true, field, value } : { ok: false, error: "Revisit date must be YYYY-MM-DD." };
  }
  const allowed = ALLOWED[field as keyof typeof ALLOWED];
  return allowed.includes(value)
    ? { ok: true, field: field as StateField, value }
    : { ok: false, error: `Invalid value for ${field}.` };
}

export function isValidCompanyId(id: string): boolean {
  return /^\d{1,20}$/.test(id);
}

const key = (id: string) => `ta:co:${id}`;

export interface StateStore {
  readonly mode: "redis" | "memory";
  getAll(ids: string[]): Promise<Record<string, AccountState>>;
  setField(id: string, field: StateField, value: string, user: string): Promise<AccountState>;
}

class RedisStore implements StateStore {
  readonly mode = "redis" as const;
  constructor(private readonly redis: Redis) {}

  async getAll(ids: string[]): Promise<Record<string, AccountState>> {
    const out: Record<string, AccountState> = {};
    if (!ids.length) {
      return out;
    }
    const pipe = this.redis.pipeline();
    for (const id of ids) {
      pipe.hgetall(key(id));
    }
    const rows = (await pipe.exec()) as (Record<string, unknown> | null)[];
    ids.forEach((id, i) => {
      const row = rows[i];
      if (row && Object.keys(row).length) {
        out[id] = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)])) as AccountState;
      }
    });
    return out;
  }

  async setField(id: string, field: StateField, value: string, user: string): Promise<AccountState> {
    const k = key(id);
    const pipe = this.redis.pipeline();
    if (value === "") {
      pipe.hdel(k, field);
    } else {
      pipe.hset(k, { [field]: value });
    }
    pipe.hset(k, { updated_by: user, updated_at: new Date().toISOString() });
    pipe.hgetall(k);
    const res = await pipe.exec();
    const row = (res[res.length - 1] ?? {}) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(row).map(([kk, v]) => [kk, String(v)])) as AccountState;
  }
}

/** Development-only store. Kept on globalThis so it survives hot reloads. */
export class MemoryStore implements StateStore {
  readonly mode = "memory" as const;
  private readonly data: Map<string, AccountState>;
  constructor(data?: Map<string, AccountState>) {
    this.data = data ?? new Map();
  }

  async getAll(ids: string[]): Promise<Record<string, AccountState>> {
    const out: Record<string, AccountState> = {};
    for (const id of ids) {
      const row = this.data.get(id);
      if (row) {
        out[id] = { ...row };
      }
    }
    return out;
  }

  async setField(id: string, field: StateField, value: string, user: string): Promise<AccountState> {
    const row = { ...(this.data.get(id) ?? {}) };
    if (value === "") {
      delete row[field];
    } else {
      row[field] = value;
    }
    row.updated_by = user;
    row.updated_at = new Date().toISOString();
    this.data.set(id, row);
    return { ...row };
  }
}

const g = globalThis as unknown as { __taMemory?: Map<string, AccountState> };
let store: StateStore | null = null;

export function getStore(): StateStore {
  if (store) {
    return store;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && tok) {
    store = new RedisStore(new Redis({ url, token: tok }));
  } else if (process.env.NODE_ENV !== "production") {
    g.__taMemory ??= new Map();
    store = new MemoryStore(g.__taMemory);
  } else {
    throw new Error("Redis is not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).");
  }
  return store;
}
