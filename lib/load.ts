/**
 * Builds the board payload: HubSpot accounts (cached CACHE_TTL_MS per server instance)
 * merged with app-side state (always read fresh, so edits show on the next load).
 */

import { type Account, toAccount } from "./accounts";
import { CACHE_TTL_MS } from "./config";
import { getIndustryLabels, getOwnerNames, getTerritoryOptions, searchTargetAccounts } from "./hubspot";
import { type AccountState, getStore } from "./state";
import type { TerritoryOptions, TerritoryValues } from "./territory";

export type BoardData = {
  accounts: Account[];
  state: Record<string, AccountState>;
  fetchedAt: string;
  storeMode: "redis" | "memory";
  /** Data Hygiene dropdown options. Empty arrays (editing disabled) if HubSpot couldn't be read. */
  territoryOptions: TerritoryOptions;
};

let cache: { at: number; accounts: Account[]; fetchedAt: string } | null = null;

async function pullAccounts(force: boolean): Promise<{ accounts: Account[]; fetchedAt: string }> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache;
  }
  const raw = await searchTargetAccounts();
  const [owners, industries] = await Promise.all([
    getOwnerNames(raw.map((r) => r.properties.hubspot_owner_id ?? "")),
    getIndustryLabels(),
  ]);
  const accounts = raw.map((r) => toAccount(r.id, r.properties, owners, industries));
  cache = { at: Date.now(), accounts, fetchedAt: new Date().toISOString() };
  return cache;
}

export async function loadBoard(force = false): Promise<BoardData> {
  const { accounts, fetchedAt } = await pullAccounts(force);
  const store = getStore();
  const [state, territoryOptions] = await Promise.all([
    store.getAll(accounts.map((a) => a.id)),
    getTerritoryOptions(force).catch(() => ({ territory: [], territory_status: [] })),
  ]);
  return { accounts, state, fetchedAt, storeMode: store.mode, territoryOptions };
}

/** Keep the cached copy in step after a notes write, so a reload within the TTL shows it. */
export function updateCachedNotes(companyId: string, notes: string): void {
  const a = cache?.accounts.find((x) => x.id === companyId);
  if (a) {
    a.notes = notes;
  }
}

/** Same, after a territory write. */
export function updateCachedTerritory(companyId: string, values: TerritoryValues): void {
  const a = cache?.accounts.find((x) => x.id === companyId);
  if (a) {
    a.territory = values.territory;
    a.territoryStatus = values.territory_status;
  }
}
