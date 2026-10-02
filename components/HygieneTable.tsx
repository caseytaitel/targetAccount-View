"use client";

import { useState } from "react";

import { type Account, compactCount } from "@/lib/accounts";
import { TERRITORY_PROPERTIES, type TerritoryProperty } from "@/lib/config";
import type { Sort, SortKey } from "@/lib/sort";
import {
  type EnumOption,
  PROPERTY_LABEL,
  type TerritoryChanges,
  type TerritoryOptions,
  type TerritoryValues,
} from "@/lib/territory";

import ConfirmWriteModal from "./ConfirmWriteModal";
import SortTh from "./SortTh";

const valuesOf = (a: Account): TerritoryValues => ({ territory: a.territory, territory_status: a.territoryStatus });

/**
 * Data Hygiene tab: accounts with a blank Territory or Territory Status. Pick values in the
 * row, then "Save…" opens ConfirmWriteModal; only its confirm button writes to HubSpot.
 */
export default function HygieneTable({
  rows,
  options,
  sort,
  onSort,
  onWritten,
  onNotes,
  onToast,
}: {
  rows: Account[];
  options: TerritoryOptions;
  sort: Sort;
  onSort: (k: SortKey) => void;
  onWritten: (id: string, values: TerritoryValues) => void;
  onNotes: (id: string) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, TerritoryChanges>>({});
  const [confirmFor, setConfirmFor] = useState<Account | null>(null);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState("");
  const optionsMissing = TERRITORY_PROPERTIES.some((p) => options[p].length === 0);

  const changesFor = (a: Account): TerritoryChanges => {
    const d = drafts[a.id] ?? {};
    const cur = valuesOf(a);
    const out: TerritoryChanges = {};
    for (const p of TERRITORY_PROPERTIES) {
      if (d[p] !== undefined && d[p] !== cur[p]) {
        out[p] = d[p];
      }
    }
    return out;
  };

  const setDraft = (id: string, p: TerritoryProperty, v: string) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), [p]: v } }));

  const clearDraft = (id: string) =>
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const labelOf = (p: TerritoryProperty, v: string) => options[p].find((o) => o.value === v)?.label ?? v;

  /** HubSpot territory write. Called solely from the modal's confirm button. */
  const write = async () => {
    if (!confirmFor) {
      return;
    }
    const a = confirmFor;
    setWriting(true);
    setWriteError("");
    try {
      const resp = await fetch(`/api/territory/${a.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: changesFor(a), expected: valuesOf(a) }),
      });
      const body = await resp.json().catch(() => ({}));
      if (resp.status === 409 && body.current) {
        onWritten(a.id, body.current as TerritoryValues);
        clearDraft(a.id);
        setConfirmFor(null);
        onToast(`${a.name} changed in HubSpot since it loaded. Nothing was written; the row shows the latest values.`, true);
        return;
      }
      if (!resp.ok) {
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
      clearDraft(a.id);
      setConfirmFor(null);
      onWritten(a.id, body.values as TerritoryValues);
      onToast(`Territory written to HubSpot for ${a.name}.`);
    } catch (err) {
      setWriteError((err as Error).message);
    } finally {
      setWriting(false);
    }
  };

  const pending = confirmFor ? changesFor(confirmFor) : {};
  const pendingProps = TERRITORY_PROPERTIES.filter((p) => pending[p] !== undefined);

  return (
    <>
      {optionsMissing && (
        <div className="banner-warn hyg-banner">
          Couldn&apos;t read the Territory options from HubSpot, so editing is off. Try Refresh.
        </div>
      )}
      <div className="pane">
        <table className="hyg">
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 220 }} />
          </colgroup>
          <thead>
            <tr>
              <SortTh k="name" label="Company Name" sort={sort} onSort={onSort} />
              <SortTh k="owner" label="Company Owner" sort={sort} onSort={onSort} />
              <SortTh k="industry" label="Industry" sort={sort} onSort={onSort} />
              <SortTh k="size" label="Size" sort={sort} onSort={onSort} right />
              <SortTh k="territory" label="Territory" sort={sort} onSort={onSort} />
              <SortTh k="territory_status" label="Territory Status" sort={sort} onSort={onSort} />
              <th />
              <SortTh k="notes" label="Notes" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted hyg-empty">
                  Every account in view has a Territory and a Territory Status.
                </td>
              </tr>
            )}
            {rows.map((a) => {
              const cur = valuesOf(a);
              const d = drafts[a.id] ?? {};
              const dirty = Object.keys(changesFor(a)).length > 0;
              const preview = a.notes.trim();
              return (
                <tr key={a.id} className="acct">
                  <td>
                    <div className="co-name">
                      <a className="rl" href={a.url} target="_blank" rel="noreferrer">
                        {a.name}
                      </a>
                    </div>
                  </td>
                  <td>{a.ownerName}</td>
                  <td>{a.industry || <span className="muted">—</span>}</td>
                  <td className="r" title={a.employees === null ? "" : `${a.employees.toLocaleString("en-US")} employees`}>
                    {a.employees === null ? <span className="muted">—</span> : compactCount(a.employees)}
                  </td>
                  {TERRITORY_PROPERTIES.map((p) => {
                    const v = d[p] ?? cur[p];
                    return (
                      <td key={p}>
                        <EnumSelect
                          value={v}
                          options={options[p]}
                          changed={d[p] !== undefined && d[p] !== cur[p]}
                          disabled={optionsMissing}
                          onChange={(nv) => setDraft(a.id, p, nv)}
                          label={`${PROPERTY_LABEL[p]} for ${a.name}`}
                        />
                      </td>
                    );
                  })}
                  <td>
                    <div className="hyg-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!dirty}
                        onClick={() => {
                          setWriteError("");
                          setConfirmFor(a);
                        }}
                      >
                        Save…
                      </button>
                      {dirty && (
                        <button className="x-btn" title="Discard changes" onClick={() => clearDraft(a.id)}>
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <button className="notes-btn" onClick={() => onNotes(a.id)} title={preview ? "Open notes" : "Add a note"}>
                      {preview ? <span className="np">{preview}</span> : <span className="notes-add">+ Add note</span>}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmFor && pendingProps.length > 0 && (
        <ConfirmWriteModal
          companyName={confirmFor.name}
          properties={pendingProps}
          change={pendingProps
            .map((p) => `${PROPERTY_LABEL[p]}: ${valuesOf(confirmFor)[p] ? labelOf(p, valuesOf(confirmFor)[p]) : "(blank)"} → ${labelOf(p, pending[p]!)}`)
            .join("; ")}
          writing={writing}
          error={writeError}
          onCancel={() => setConfirmFor(null)}
          onConfirm={write}
        >
          <div>
            <div className="block-label">New values</div>
            <div className="preview">
              {pendingProps.map((p) => (
                <div key={p}>
                  {p} = <mark>{pending[p]}</mark>
                </div>
              ))}
            </div>
          </div>
        </ConfirmWriteModal>
      )}
    </>
  );
}

function EnumSelect({
  value,
  options,
  changed,
  disabled,
  onChange,
  label,
}: {
  value: string;
  options: EnumOption[];
  changed: boolean;
  disabled: boolean;
  onChange: (v: string) => void;
  label: string;
}) {
  // A value HubSpot no longer offers is still shown, so the row never misreports what's there.
  const opts = value && !options.some((o) => o.value === value) ? [{ value, label: value }, ...options] : options;
  return (
    <select
      className={`sel${changed ? " changed" : ""}`}
      data-v={value}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      {!value && (
        <option value="" disabled>
          — not set —
        </option>
      )}
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
