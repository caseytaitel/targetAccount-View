"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { type Account, type Tag, bucket, compactCount } from "@/lib/accounts";
import {
  OUTREACH_OWNERS,
  OUTREACH_STATUSES,
  OUT_TAB,
  TAGS,
  TERRITORIES,
  TIERS,
  type TabKey,
  type TagKey,
} from "@/lib/config";
import type { BoardData } from "@/lib/load";
import { today } from "@/lib/notes";
import type { AccountState, StateField } from "@/lib/state";

import NotesDrawer from "./NotesDrawer";

type SortKey = "owner" | "tags" | "name";
type Tip = { lines: string[]; x: number; y: number };
type SectionKey = (typeof TIERS)[number] | "untiered" | "revisit";

const TAB_LABEL: Record<TabKey, string> = {
  Northeast: "Northeast",
  "NY / NJ": "NY / NJ",
  "Mid-Atlantic": "Mid-Atlantic",
  Northwest: "Northwest",
  [OUT_TAB]: "Out of Territory",
};
const TAB_ORDER: TabKey[] = [...TERRITORIES, OUT_TAB];

const SECTIONS: { key: SectionKey; label: string; def?: string }[] = [
  { key: "A", label: "Tier A" },
  { key: "B", label: "Tier B" },
  { key: "C", label: "Tier C" },
  { key: "untiered", label: "Untiered", def: "set a tier to move an account up" },
  { key: "revisit", label: "Revisit later", def: "returns to its tier on the revisit date" },
];

/** Per-viewer conveniences only (tab, sort, collapsed sections). Shared state lives in Redis. */
function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(`ta:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(`ta:${key}`, JSON.stringify(value));
  } catch {
    /* private window etc. */
  }
}

function sorter(sort: SortKey) {
  return (a: Account, b: Account): number => {
    if (sort === "owner") {
      return a.ownerName.localeCompare(b.ownerName) || a.name.localeCompare(b.name);
    }
    if (sort === "tags") {
      return b.tags.length - a.tags.length || a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  };
}

export default function Board({ initial, user }: { initial: BoardData; user: string }) {
  const [data, setData] = useState(initial);
  const [stateMap, setStateMap] = useState<Record<string, AccountState>>(initial.state);
  const [tab, setTab] = useState<TabKey>(TERRITORIES[0]);
  const [sort, setSort] = useState<SortKey>("name");
  const [tagFilter, setTagFilter] = useState<TagKey[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [outreachFilter, setOutreachFilter] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ revisit: true });
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const todayIso = today();

  // Restore per-viewer prefs after mount (localStorage is not available during SSR).
  useEffect(() => {
    const t = readPref<TabKey>("tab", TERRITORIES[0]);
    if (TAB_ORDER.includes(t)) {
      setTab(t);
    }
    setSort(readPref<SortKey>("sort", "name"));
    setCollapsed(readPref("collapsed", { revisit: true }));
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const id = setTimeout(() => setToast(null), toast.err ? 6000 : 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const byTab = useMemo(() => {
    const groups = new Map<TabKey | null, Account[]>();
    for (const a of data.accounts) {
      const k = bucket(a);
      groups.set(k, [...(groups.get(k) ?? []), a]);
    }
    return groups;
  }, [data.accounts]);

  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of data.accounts) {
      if (a.ownerId) {
        m.set(a.ownerId, a.ownerName);
      }
    }
    return [...m.entries()].sort((x, y) => x[1].localeCompare(y[1]));
  }, [data.accounts]);

  const unmapped = byTab.get(null) ?? [];

  const sections = useMemo(() => {
    const rows = (byTab.get(tab) ?? []).filter((a) => {
      const st = stateMap[a.id] ?? {};
      if (ownerFilter && a.ownerId !== ownerFilter) {
        return false;
      }
      if (outreachFilter) {
        const o = st.outreach_owner ?? "";
        if (outreachFilter === "none" ? o !== "" : o !== outreachFilter) {
          return false;
        }
      }
      if (tagFilter.length && !a.tags.some((t) => tagFilter.includes(t.key))) {
        return false;
      }
      return true;
    });
    const out: Record<SectionKey, Account[]> = { A: [], B: [], C: [], untiered: [], revisit: [] };
    for (const a of rows) {
      const st = stateMap[a.id] ?? {};
      if (st.revisit_on && st.revisit_on > todayIso) {
        out.revisit.push(a);
      } else if (st.tier && (TIERS as readonly string[]).includes(st.tier)) {
        out[st.tier as (typeof TIERS)[number]].push(a);
      } else {
        out.untiered.push(a);
      }
    }
    const cmp = sorter(sort);
    for (const k of Object.keys(out) as SectionKey[]) {
      out[k].sort(cmp);
    }
    // Revisit later reads best soonest-first regardless of the chosen sort.
    out.revisit.sort(
      (a, b) => (stateMap[a.id]?.revisit_on ?? "").localeCompare(stateMap[b.id]?.revisit_on ?? "") || cmp(a, b),
    );
    return { out, shown: rows.length };
  }, [byTab, tab, stateMap, ownerFilter, outreachFilter, tagFilter, sort, todayIso]);

  const chooseTab = (t: TabKey) => {
    setTab(t);
    writePref("tab", t);
  };
  const chooseSort = (s: SortKey) => {
    setSort(s);
    writePref("sort", s);
  };
  const toggleSection = (k: SectionKey) => {
    setCollapsed((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      writePref("collapsed", next);
      return next;
    });
  };
  const toggleTag = (k: TagKey) =>
    setTagFilter((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const resp = await fetch("/api/accounts?refresh=1", { cache: "no-store" });
      const body = await resp.json();
      if (!resp.ok) {
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
      setData(body as BoardData);
      setStateMap((body as BoardData).state);
      setToast({ msg: "Refreshed from HubSpot." });
    } catch (err) {
      setToast({ msg: `Refresh failed: ${(err as Error).message}`, err: true });
    } finally {
      setRefreshing(false);
    }
  }, []);

  /** App-side state (Redis). Optimistic; reverts on failure. Never touches HubSpot. */
  const saveField = useCallback(async (id: string, field: StateField, value: string) => {
    let previous: AccountState | undefined;
    setStateMap((prev) => {
      previous = prev[id];
      const row = { ...(prev[id] ?? {}) };
      if (value === "") {
        delete row[field];
      } else {
        row[field] = value;
      }
      return { ...prev, [id]: row };
    });
    setSaving((s) => ({ ...s, [`${id}:${field}`]: true }));
    try {
      const resp = await fetch(`/api/state/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
      setStateMap((prev) => ({ ...prev, [id]: body.state }));
    } catch (err) {
      setStateMap((prev) => {
        const next = { ...prev };
        if (previous) {
          next[id] = previous;
        } else {
          delete next[id];
        }
        return next;
      });
      setToast({ msg: `Couldn't save: ${(err as Error).message}`, err: true });
    } finally {
      setSaving((s) => {
        const next = { ...s };
        delete next[`${id}:${field}`];
        return next;
      });
    }
  }, []);

  const onNotesSaved = useCallback((id: string, notes: string) => {
    setData((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, notes } : a)) }));
  }, []);

  const showTip = (lines: string[], el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left, window.innerWidth - 348));
    setTip({ lines, x, y: r.bottom + 6 });
  };

  const isOut = tab === OUT_TAB;
  const colCount = isOut ? 11 : 10;
  const notesAccount = notesFor ? data.accounts.find((a) => a.id === notesFor) : undefined;
  const refreshedAt = new Date(data.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const filtersOn = tagFilter.length > 0 || ownerFilter !== "" || outreachFilter !== "";

  return (
    <div className="container">
      <header className="page-header">
        <div className="header-left">
          <h1>Target Accounts</h1>
          <p>
            {owners.map(([, n]) => n).join(" & ")} · {data.accounts.length} target accounts
          </p>
        </div>
        <div className="header-right">
          <span className="refresh-note">Refreshed {refreshedAt}</span>
          <button className="fb" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          {user && (
            <span>
              {user} · <a className="signout" href="/logout">Sign out</a>
            </span>
          )}
        </div>
      </header>

      <div className="tab-container">
        <nav className="tab-bar" role="tablist">
          {TAB_ORDER.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={`tab${tab === t ? " active" : ""}${t === OUT_TAB ? " tab-split" : ""}`}
              onClick={() => chooseTab(t)}
            >
              {TAB_LABEL[t]} <span className="cz">· {(byTab.get(t) ?? []).length}</span>
            </button>
          ))}
        </nav>

        <div className="filter-bar">
          <div className="fgroup">
            <span className="flabel">Sort</span>
            {(
              [
                ["name", "Name"],
                ["owner", "Company Owner"],
                ["tags", "Company Tags"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={`fb${sort === k ? " active" : ""}`} onClick={() => chooseSort(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="fgroup">
            <span className="flabel">Tags</span>
            {TAGS.map((t) => (
              <button
                key={t.key}
                className={`fb${tagFilter.includes(t.key) ? " active" : ""}`}
                onClick={() => toggleTag(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="fgroup">
            <span className="flabel">Owner</span>
            <button className={`fb${ownerFilter === "" ? " active" : ""}`} onClick={() => setOwnerFilter("")}>
              All
            </button>
            {owners.map(([id, name]) => (
              <button key={id} className={`fb${ownerFilter === id ? " active" : ""}`} onClick={() => setOwnerFilter(id)}>
                {name.split(" ")[0]}
              </button>
            ))}
          </div>
          <div className="fgroup">
            <span className="flabel">Outreach</span>
            <button className={`fb${outreachFilter === "" ? " active" : ""}`} onClick={() => setOutreachFilter("")}>
              All
            </button>
            {OUTREACH_OWNERS.map((o) => (
              <button key={o} className={`fb${outreachFilter === o ? " active" : ""}`} onClick={() => setOutreachFilter(o)}>
                {o}
              </button>
            ))}
            <button
              className={`fb${outreachFilter === "none" ? " active" : ""}`}
              onClick={() => setOutreachFilter("none")}
            >
              Unassigned
            </button>
          </div>
          {filtersOn && (
            <button
              className="fb-clear"
              onClick={() => {
                setTagFilter([]);
                setOwnerFilter("");
                setOutreachFilter("");
              }}
            >
              Clear filters · {sections.shown} shown
            </button>
          )}
        </div>

        <div className="pane" onScroll={() => setTip(null)}>
          <table>
            <colgroup>
              <col style={{ width: 200 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 58 }} />
              <col style={{ width: 200 }} />
              {isOut && <col style={{ width: 130 }} />}
              <col style={{ width: 70 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 180 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Company Name</th>
                <th>Company Owner</th>
                <th>Industry</th>
                <th className="r">Size</th>
                <th>Company Tags</th>
                {isOut && <th>Territory / Status</th>}
                <th>Tier</th>
                <th>Outreach Owner</th>
                <th>Outreach Status</th>
                <th>Revisit</th>
                <th>Notes</th>
              </tr>
            </thead>
            {SECTIONS.map((s) => {
              const rows = sections.out[s.key];
              const open = !collapsed[s.key];
              return (
                <tbody key={s.key}>
                  <tr
                    className={`sec-row sec-${s.key}`}
                    aria-expanded={open}
                    onClick={() => toggleSection(s.key)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSection(s.key);
                      }
                    }}
                  >
                    <td colSpan={colCount}>
                      <span className="sec-label">
                        <span className="sec-chev">▾</span>
                        <span className="sec-dot" />
                        {s.label} <span className="cz">· {rows.length}</span>
                      </span>
                      {s.def && <span className="sec-def">{s.def}</span>}
                    </td>
                  </tr>
                  {open &&
                    rows.map((a) => (
                      <Row
                        key={a.id}
                        a={a}
                        st={stateMap[a.id] ?? {}}
                        isOut={isOut}
                        todayIso={todayIso}
                        saving={saving}
                        onSave={saveField}
                        onNotes={() => setNotesFor(a.id)}
                        onTip={showTip}
                        onTipEnd={() => setTip(null)}
                      />
                    ))}
                </tbody>
              );
            })}
          </table>
        </div>
      </div>

      <footer className="footer">
        <span>
          HubSpot is read-only here except company Notes, which are written only after you confirm.
          {data.storeMode === "memory" && (
            <span className="qflag" title="No Redis env vars found, so tier/outreach/revisit edits live in this dev server's memory and are lost on restart.">
              {" "}⚑ dev store (not saved)
            </span>
          )}
        </span>
        {unmapped.length > 0 && (
          <span
            className="qflag"
            title={`Not on any tab: territory is outside Northeast, NY / NJ, Mid-Atlantic and Northwest, and status is not Out of territory or Approved holdover.\n${unmapped
              .map((a) => `${a.name} — ${a.territory || "no territory"} / ${a.territoryStatus || "no status"}`)
              .join("\n")}`}
          >
            ⚑ {unmapped.length} unmapped
          </span>
        )}
      </footer>

      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          {tip.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}

      {notesAccount && (
        <NotesDrawer
          account={notesAccount}
          user={user}
          onClose={() => setNotesFor(null)}
          onSaved={(notes) => {
            onNotesSaved(notesAccount.id, notes);
            setToast({ msg: "Note written to HubSpot." });
          }}
        />
      )}

      {toast && <div className={`toast${toast.err ? " err" : ""}`}>{toast.msg}</div>}
    </div>
  );
}

function Row({
  a,
  st,
  isOut,
  todayIso,
  saving,
  onSave,
  onNotes,
  onTip,
  onTipEnd,
}: {
  a: Account;
  st: AccountState;
  isOut: boolean;
  todayIso: string;
  saving: Record<string, boolean>;
  onSave: (id: string, field: StateField, value: string) => void;
  onNotes: () => void;
  onTip: (lines: string[], el: HTMLElement) => void;
  onTipEnd: () => void;
}) {
  const busy = (f: StateField) => Boolean(saving[`${a.id}:${f}`]);
  const revisitDue = Boolean(st.revisit_on && st.revisit_on <= todayIso);
  const preview = a.notes.trim();

  return (
    <tr className="acct">
      <td>
        <div className="co-name">
          <a className="rl" href={a.url} target="_blank" rel="noreferrer">
            {a.name}
          </a>
          {!a.territoryStatus && (
            <span className="qflag" title="Territory Status is not set in HubSpot. Shown here by its Territory.">
              {" "}⚑
            </span>
          )}
        </div>
      </td>
      <td>{a.ownerName}</td>
      <td>{a.industry || <span className="muted">—</span>}</td>
      <td className="r" title={a.employees === null ? "" : `${a.employees.toLocaleString("en-US")} employees`}>
        {a.employees === null ? <span className="muted">—</span> : compactCount(a.employees)}
      </td>
      <td>
        <TagPills tags={a.tags} onTip={onTip} onTipEnd={onTipEnd} />
      </td>
      {isOut && (
        <td>
          <div>{a.territory || <span className="muted">no territory</span>}</div>
          <div className="co-sub">
            <span className={`pill ${a.territoryStatus === "Approved holdover" ? "pill-hold" : "pill-out"}`}>
              {a.territoryStatus}
            </span>
          </div>
        </td>
      )}
      <td>
        <select
          className="sel tier"
          data-v={st.tier ?? ""}
          value={st.tier ?? ""}
          disabled={busy("tier")}
          onChange={(e) => onSave(a.id, "tier", e.target.value)}
          aria-label={`Tier for ${a.name}`}
        >
          <option value="">—</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          className="sel"
          data-v={st.outreach_owner ?? ""}
          value={st.outreach_owner ?? ""}
          disabled={busy("outreach_owner")}
          onChange={(e) => onSave(a.id, "outreach_owner", e.target.value)}
          aria-label={`Outreach owner for ${a.name}`}
        >
          <option value="">—</option>
          {OUTREACH_OWNERS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          className="sel status"
          data-v={st.outreach_status ?? ""}
          value={st.outreach_status ?? ""}
          disabled={busy("outreach_status")}
          onChange={(e) => onSave(a.id, "outreach_status", e.target.value)}
          aria-label={`Outreach status for ${a.name}`}
        >
          <option value="">—</option>
          {OUTREACH_STATUSES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="date-wrap">
          <input
            type="date"
            className={`date-in${st.revisit_on ? "" : " unset"}`}
            value={st.revisit_on ?? ""}
            min={st.revisit_on ? undefined : todayIso}
            disabled={busy("revisit_on")}
            onChange={(e) => onSave(a.id, "revisit_on", e.target.value)}
            aria-label={`Revisit date for ${a.name}`}
          />
          {st.revisit_on && (
            <button className="x-btn" title="Clear revisit date" onClick={() => onSave(a.id, "revisit_on", "")}>
              ×
            </button>
          )}
          {revisitDue && <span className="pill pill-due">Revisit due</span>}
        </div>
      </td>
      <td>
        <button className="notes-btn" onClick={onNotes} title={preview ? "Open notes" : "Add a note"}>
          {preview ? <span className="np">{preview}</span> : <span className="notes-add">+ Add note</span>}
        </button>
      </td>
    </tr>
  );
}

function TagPills({
  tags,
  onTip,
  onTipEnd,
}: {
  tags: Tag[];
  onTip: (lines: string[], el: HTMLElement) => void;
  onTipEnd: () => void;
}) {
  if (!tags.length) {
    return <span className="muted">—</span>;
  }
  return (
    <div className="tag-wrap">
      {tags.map((t) => (
        <span
          key={t.key}
          className="pill pill-tag"
          tabIndex={0}
          onMouseEnter={(e) => onTip(t.lines, e.currentTarget)}
          onMouseLeave={onTipEnd}
          onFocus={(e) => onTip(t.lines, e.currentTarget)}
          onBlur={onTipEnd}
          aria-label={`${t.label}: ${t.lines.join(", ")}`}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}
