import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import bidiFactory from 'bidi-js';

const bidi = bidiFactory();

function toVisualOrder(text: string, baseDir: 'ltr' | 'rtl'): string {
  if (!text) return text;
  const embeddingLevels = bidi.getEmbeddingLevels(text, baseDir);
  return bidi.getReorderedString(text, embeddingLevels);
}

function bidiCell(value: string | number, baseDir: 'ltr' | 'rtl'): string {
  return toVisualOrder(String(value), baseDir);
}

// jsPDF runs its own (incomplete) BiDi engine on every text() call via a global
// "postProcessText" handler — it mangles digits and parentheses inside Hebrew
// (e.g. "אחוזון 90 (P90)" -> "אחוזון 09 (09P)") and would re-order the strings
// we already laid out with bidi-js. autoTable calls doc.text() without options,
// so we can't disable it per-call there. Patching doc.text() to always inject
// these flags makes jsPDF's engine an identity transform (verified) while its
// UTF-8 escaping handler keeps working.
const BIDI_NOOP = { isInputVisual: true, isOutputVisual: true, isInputRtl: false, isOutputRtl: false } as const;

function disableJsPdfBidi(doc: jsPDF) {
  const orig = doc.text.bind(doc);
  (doc as any).text = (text: any, x: number, y: number, options?: any, transform?: any) =>
    orig(text, x, y, { ...BIDI_NOOP, ...(options || {}) }, transform);
}

export interface ExportSection {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

/**
 * Neutralize CSV/formula injection: a spreadsheet treats a cell starting with
 * = + - @ (or tab/CR) as a formula and executes it on open (e.g.
 * =HYPERLINK(...) exfiltration, legacy =cmd|... RCE). DB-sourced strings
 * (names, issue types) are user-controllable, so prefix an apostrophe to force
 * the value to be treated as literal text.
 */
function csvSafe(value: string | number): string | number {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

function buildFilename(prefix: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}_${date}.${ext}`;
}

export function exportToExcel(sections: ExportSection[], filenamePrefix = 'analytics') {
  const wb = XLSX.utils.book_new();

  for (const section of sections) {
    // Sanitize every cell (headers + body) against formula injection.
    const data = [section.headers.map(csvSafe), ...section.rows.map(r => r.map(csvSafe))];
    const ws = XLSX.utils.aoa_to_sheet(data);

    const colWidths = section.headers.map((h, i) => {
      const maxLen = Math.max(
        h.length,
        ...section.rows.map(r => String(r[i] ?? '').length),
      );
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws['!cols'] = colWidths;

    const sheetName = section.title.replace(/[^\w֐-׿ ]/g, '').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, buildFilename(filenamePrefix, 'xlsx'));
}

let reportFontCache: { regular: string; bold: string } | null = null;

async function fetchFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch font ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// DejaVu Sans subset: Latin + Latin-ext + Greek + Cyrillic + Hebrew +
// punctuation/currency. Covers every UI language plus foreign-script DB
// data (names, locations) — Heebo was Latin+Hebrew only and rendered
// Cyrillic/Greek as blank glyphs.
async function loadReportFont(): Promise<{ regular: string; bold: string }> {
  if (reportFontCache) return reportFontCache;
  const [regular, bold] = await Promise.all([
    fetchFontBase64('/fonts/ReportSans-Regular.ttf'),
    fetchFontBase64('/fonts/ReportSans-Bold.ttf'),
  ]);
  reportFontCache = { regular, bold };
  return reportFontCache;
}

function registerReportFont(doc: jsPDF, fonts: { regular: string; bold: string }) {
  doc.addFileToVFS('ReportSans-Regular.ttf', fonts.regular);
  doc.addFont('ReportSans-Regular.ttf', 'ReportSans', 'normal');
  doc.addFileToVFS('ReportSans-Bold.ttf', fonts.bold);
  doc.addFont('ReportSans-Bold.ttf', 'ReportSans', 'bold');
}

const RTL_LANGS = new Set(['he', 'ar', 'fa', 'ur']);
function isRtl(lang: string): boolean {
  return RTL_LANGS.has(lang.toLowerCase().split('-')[0]);
}

export async function exportToPdf(
  sections: ExportSection[],
  filenamePrefix = 'analytics',
  title?: string,
  language: string = 'he',
) {
  const fonts = await loadReportFont();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  disableJsPdfBidi(doc);
  registerReportFont(doc, fonts);
  doc.setFont('ReportSans', 'normal');

  const rtl = isRtl(language);
  const baseDir: 'ltr' | 'rtl' = rtl ? 'rtl' : 'ltr';
  const align: 'right' | 'left' = rtl ? 'right' : 'left';
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('ReportSans', 'bold');
  doc.setFontSize(16);
  const pageTitle = title || 'ToiletMon Analytics Report';
  doc.text(toVisualOrder(pageTitle, baseDir), pageWidth / 2, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('ReportSans', 'normal');
  doc.text(
    toVisualOrder(
      new Date().toLocaleDateString(language, { year: 'numeric', month: 'long', day: 'numeric' }),
      baseDir,
    ),
    pageWidth / 2,
    22,
    { align: 'center' },
  );

  let yPos = 30;

  for (const section of sections) {
    if (yPos > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      yPos = 15;
    }

    doc.setFont('ReportSans', 'bold');
    doc.setFontSize(12);
    const titleX = rtl ? pageWidth - 14 : 14;
    doc.text(toVisualOrder(section.title, baseDir), titleX, yPos, { align });
    yPos += 3;

    autoTable(doc, {
      startY: yPos,
      head: [section.headers.map(h => bidiCell(h, baseDir))],
      body: section.rows.map(r => r.map(v => bidiCell(v, baseDir))),
      theme: 'striped',
      headStyles: { fillColor: [0, 180, 160], textColor: 255, fontStyle: 'bold', font: 'ReportSans', halign: align },
      bodyStyles: { font: 'ReportSans', halign: align },
      styles: { fontSize: 9, cellPadding: 2, font: 'ReportSans', halign: align },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  doc.save(buildFilename(filenamePrefix, 'pdf'));
}
