"use client";

import { useCallback, useEffect, useState } from "react";

import type { Account } from "@/lib/accounts";
import { WRITABLE_PROPERTY } from "@/lib/config";
import { ENTRY_MAX_LENGTH, formatEntry, prependEntry, today } from "@/lib/notes";

import ConfirmWriteModal from "./ConfirmWriteModal";

/**
 * Reads the live HubSpot `notes` value and lets the user draft a new entry.
 * Nothing is written from here: "Save to HubSpot…" only opens ConfirmWriteModal.
 */
export default function NotesDrawer({
  account,
  user,
  onClose,
  onSaved,
}: {
  account: Account;
  user: string;
  onClose: () => void;
  onSaved: (notes: string) => void;
}) {
  const [current, setCurrent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [entry, setEntry] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState("");
  const [conflict, setConflict] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const resp = await fetch(`/api/notes/${account.id}`, { cache: "no-store" });
      const body = await resp.json();
      if (!resp.ok) {
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
      setCurrent(body.notes ?? "");
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [account.id]);

  useEffect(() => {
    setCurrent(null);
    setEntry("");
    setConflict(false);
    setWriteError("");
    void load();
  }, [load]);

  const close = useCallback(() => {
    if (writing) {
      return;
    }
    if (entry.trim() && !window.confirm("Discard this unsaved note?")) {
      return;
    }
    onClose();
  }, [entry, onClose, writing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirming) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, confirming]);

  const entryLine = formatEntry(user || "unknown", today(), entry);
  const proposed = current === null ? "" : prependEntry(current, entryLine);

  /** HubSpot notes write. Called solely from the modal's confirm button. */
  const write = async () => {
    if (current === null) {
      return;
    }
    setWriting(true);
    setWriteError("");
    try {
      const resp = await fetch(`/api/notes/${account.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry, expectedCurrent: current }),
      });
      const body = await resp.json().catch(() => ({}));
      if (resp.status === 409) {
        setCurrent(body.current ?? "");
        setConflict(true);
        setConfirming(false);
        return;
      }
      if (!resp.ok) {
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
      setCurrent(body.notes);
      setEntry("");
      setConflict(false);
      setConfirming(false);
      onSaved(body.notes);
    } catch (err) {
      setWriteError((err as Error).message);
    } finally {
      setWriting(false);
    }
  };

  return (
    <>
      <div className="drawer-scrim" onClick={close} />
      <aside className="drawer" role="dialog" aria-label={`Notes for ${account.name}`}>
        <div className="drawer-head">
          <div>
            <h2>{account.name}</h2>
            <div className="co-sub">
              HubSpot company property <code>notes</code> ·{" "}
              <a className="rl" href={account.url} target="_blank" rel="noreferrer">
                open record
              </a>
            </div>
          </div>
          <button className="x-btn" style={{ fontSize: 20 }} onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawer-body">
          {conflict && (
            <div className="banner-warn">
              Someone changed these notes in HubSpot after you opened them. The latest version is shown below.
              Nothing was written. Review it, then save again.
            </div>
          )}

          <div>
            <div className="block-label">
              New entry <span className="def">added to the top, dated {today()}</span>
            </div>
            <textarea
              className="notes-entry"
              value={entry}
              maxLength={ENTRY_MAX_LENGTH}
              onChange={(e) => setEntry(e.target.value)}
              placeholder="What happened, what's next…"
              autoFocus
            />
          </div>

          <div>
            <div className="block-label">
              Current notes in HubSpot{" "}
              <span className="def">
                <button className="fb-clear" onClick={() => void load()}>
                  reload
                </button>
              </span>
            </div>
            {loadError ? (
              <div className="banner-err">Couldn&apos;t read notes: {loadError}</div>
            ) : current === null ? (
              <div className="hint">Loading…</div>
            ) : current.trim() ? (
              <div className="notes-current">{current}</div>
            ) : (
              <div className="hint">No notes yet.</div>
            )}
          </div>
        </div>

        <div className="drawer-foot">
          <span className="hint">Nothing is sent to HubSpot until you confirm.</span>
          <button
            className="btn btn-primary"
            disabled={!entry.trim() || current === null}
            onClick={() => {
              setWriteError("");
              setConfirming(true);
            }}
          >
            Save to HubSpot…
          </button>
        </div>
      </aside>

      {confirming && current !== null && (
        <ConfirmWriteModal
          companyName={account.name}
          properties={[WRITABLE_PROPERTY]}
          change={
            current.trim()
              ? "Adds one entry above the existing notes; existing text is kept as-is."
              : "Sets the first note."
          }
          writing={writing}
          error={writeError}
          onCancel={() => setConfirming(false)}
          onConfirm={write}
        >
          <div>
            <div className="block-label">New value</div>
            <div className="preview">
              <mark>{entryLine}</mark>
              {proposed.slice(entryLine.length)}
            </div>
          </div>
        </ConfirmWriteModal>
      )}
    </>
  );
}
