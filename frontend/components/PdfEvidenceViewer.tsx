// Keeps the browser-only PDF.js viewer separate from source uploads and text previews.
"use client";

import dynamic from "next/dynamic";

const PdfViewerClient = dynamic(
  () => import("./PdfViewerClient").then((module) => module.PdfViewerClient),
  {
    ssr: false,
    loading: () => <div className="pdf-viewer-state">Preparing PDF viewer…</div>,
  },
);

export function PdfEvidenceViewer({
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
  return (
    <PdfViewerClient
      documentUrl={documentUrl}
      exactQuote={exactQuote}
      pageNumber={pageNumber}
      pdfBBox={pdfBBox}
    />
  );
}
