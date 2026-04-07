// Lightweight ambient declaration so existing code using PDFKit.PDFDocument compiles
declare namespace PDFKit {
  // Map PDFKit.PDFDocument to the actual type from the pdfkit package
  // This avoids TS2503 when @types/pdfkit is not providing a global namespace
  export type PDFDocument = import('pdfkit').PDFDocument;
}
