import { ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  wide,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal ${wide ? "wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`field ${className}`}>
      {label}
      {children}
    </label>
  );
}

export function Loading() {
  return <div className="loading">Loading…</div>;
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action && <div style={{ marginTop: "1rem" }}>{action}</div>}
    </div>
  );
}

export function StatusBadge({
  voided,
  balance,
}: {
  voided?: boolean;
  balance?: number;
}) {
  if (voided) return <span className="badge void">Void</span>;
  if (balance !== undefined) {
    if (balance <= 0.005) return <span className="badge paid">Paid</span>;
    return <span className="badge open">Open</span>;
  }
  return null;
}
