// Renders entitled PDFs with exact text highlights entirely in the browser.
"use client";

import { PdfHighlighter, type Highlight } from "react-pdf-highlight-viewer";
import { pdfjs } from "react-pdf";
import { useEffect, useMemo, useState } from "react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function PdfViewerClient({
  documentUrl,
  pageNumber,
  exactQuote,
  pdfBBox,
}: {
  documentUrl: string;
  pageNumber: number;
  exactQuote: string;
  pdfBBox?: number[];
}) {
  const textHighlight = useMemo<Highlight>(() => ({
    pageNumber,
    content: exactQuote,
    color: "rgba(108, 196, 226, 0.45)",
  }), [exactQuote, pageNumber]);
  const [highlight, setHighlight] = useState<Highlight>(textHighlight);

  useEffect(() => {
    setHighlight(textHighlight);
    if (!pdfBBox || pdfBBox.length !== 4) return;
    void pdfjs.getDocument(documentUrl).promise
      .then((document) => document.getPage(pageNumber))
      .then((page) => {
        const viewport = page.getViewport({ scale: 1 });
        setHighlight({
          ...textHighlight,
          boundingRect: {
            left: (pdfBBox[0] / viewport.width) * 100,
            top: (pdfBBox[1] / viewport.height) * 100,
            width: ((pdfBBox[2] - pdfBBox[0]) / viewport.width) * 100,
            height: ((pdfBBox[3] - pdfBBox[1]) / viewport.height) * 100,
          },
        });
      });
  }, [documentUrl, pageNumber, pdfBBox, textHighlight]);

  return (
    <div className="pdf-viewer-client">
      <PdfHighlighter
        defaultHighlightColor="rgba(108, 196, 226, 0.45)"
        file={documentUrl}
        highlights={[highlight]}
        loading={<div className="pdf-viewer-state">Loading authorized PDF…</div>}
      />
    </div>
  );
}
