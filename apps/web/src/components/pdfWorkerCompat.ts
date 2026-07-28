import { ensurePdfJsRuntimeCompatibility } from './pdfJsCompatibility.js';

ensurePdfJsRuntimeCompatibility();
await import('pdfjs-dist/build/pdf.worker.mjs');
