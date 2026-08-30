import { useEffect, useState } from "react";
import {
  closePrintPreview,
  getPrintPreviewUrl,
  subscribePrintPreview,
} from "../stores/printPreviewStore";

export function PrintPreviewOverlay() {
  const [url, setUrl] = useState(getPrintPreviewUrl);

  useEffect(() => subscribePrintPreview(() => setUrl(getPrintPreviewUrl())), []);

  if (!url) return null;

  return (
    <div
      className="print-preview-overlay"
      role="dialog"
      aria-label="Invoice print form"
    >
      <button
        type="button"
        className="print-preview-close"
        aria-label="Close print form"
        onClick={() => closePrintPreview()}
      >
        X
      </button>
      <iframe title="Invoice print form" src={url} />
    </div>
  );
}
