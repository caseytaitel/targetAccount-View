"use client";

import { useEffect, useRef } from "react";

/**
 * The explicit-permission gate for the app's only HubSpot write. Shows exactly what will be
 * written: the company, the property, and the full new value with the added entry highlighted.
 * Focus starts on Cancel so a stray Enter never writes.
 */
export default function ConfirmWriteModal({
  companyName,
  current,
  entryLine,
  proposed,
  writing,
  error,
  onCancel,
  onConfirm,
}: {
  companyName: string;
  current: string;
  entryLine: string;
  proposed: string;
  writing: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !writing) {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel, writing]);

  const rest = proposed.slice(entryLine.length);

  return (
    <div className="modal-scrim" onClick={() => !writing && onCancel()}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cw-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="cw-title">Write to HubSpot?</h2>
          <p>This updates a live HubSpot record. Review the exact value below.</p>
        </div>
        <div className="modal-body">
          <dl className="kv">
            <dt>Company</dt>
            <dd>{companyName}</dd>
            <dt>Property</dt>
            <dd>
              <code>notes</code> (only this property changes)
            </dd>
            <dt>Change</dt>
            <dd>{current.trim() ? "Adds one entry above the existing notes; existing text is kept as-is." : "Sets the first note."}</dd>
          </dl>
          <div>
            <div className="block-label">New value</div>
            <div className="preview">
              <mark>{entryLine}</mark>
              {rest}
            </div>
          </div>
          {error && <div className="banner-err">Not written: {error}</div>}
        </div>
        <div className="modal-foot">
          <button ref={cancelRef} className="btn" onClick={onCancel} disabled={writing}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={writing}>
            {writing ? "Writing…" : "Write to HubSpot"}
          </button>
        </div>
      </div>
    </div>
  );
}
