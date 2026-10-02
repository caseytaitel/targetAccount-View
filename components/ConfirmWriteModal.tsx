"use client";

import { type ReactNode, useEffect, useRef } from "react";

/**
 * The explicit-permission gate for every HubSpot write (notes, and territory on the Data
 * Hygiene tab). Its confirm button is the only client-side caller of a write route. The caller
 * passes exactly what will be written: the company, the properties, a one-line summary of the
 * change, and the new value(s) as `children`. Focus starts on Cancel so a stray Enter never writes.
 */
export default function ConfirmWriteModal({
  companyName,
  properties,
  change,
  children,
  writing,
  error,
  onCancel,
  onConfirm,
}: {
  companyName: string;
  properties: readonly string[];
  change: string;
  children: ReactNode;
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
            <dt>{properties.length === 1 ? "Property" : "Properties"}</dt>
            <dd>
              {properties.map((p, i) => (
                <span key={p}>
                  {i > 0 && ", "}
                  <code>{p}</code>
                </span>
              ))}{" "}
              (only {properties.length === 1 ? "this property changes" : "these properties change"})
            </dd>
            <dt>Change</dt>
            <dd>{change}</dd>
          </dl>
          {children}
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
