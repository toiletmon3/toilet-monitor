import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import bidiFactory from 'bidi-js';

const bidi = bidiFactory();

function toVisualOrder(text: string, baseDir: 'ltr' | 'rtl'): string {
  if (!text) return text;
  const embeddingLevels = bidi.getEmbeddingLevels(text, baseDir);
  const flips = bidi.getReorderSegments(text, embeddingLevels);
  const mirrored = bidi.getMirroredCharactersMap(text, embeddingLevels);
  const chars = Array.from(text);
  mirrored.forEach((replacement: string, index: number) => {
    chars[index] = replacement;
  });
  for (const [start, end] of flips) {
    let i = start;
    let j = end;
    while (i < j) {
      const tmp = chars[i];
      chars[i] = chars[j];
      chars[j] = tmp;
      i++;
      j--;
    }
  }
  return chars.join('');
}

function bidiCell(value: string | number, baseDir: 'ltr' | 'rtl'): string {
  return toVisualOrder(String(value), baseDir);
}

export interface ExportSection {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

function buildFilename(prefix: string, ext: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}_${date}.${ext}`;
}

export function exportToExcel(sections: ExportSection[], filenamePrefix = 'analytics') {
  const wb = XLSX.utils.book_new();

  for (const section of sections) {
    const data = [section.headers, ...section.rows];
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

let heeboCache: { regular: string; bold: string } | null = null;

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

async function loadHeebo(): Promise<{ regular: string; bold: string }> {
  if (heeboCache) return heeboCache;
  const [regular, bold] = await Promise.all([
    fetchFontBase64('/fonts/Heebo-Regular.ttf'),
    fetchFontBase64('/fonts/Heebo-Bold.ttf'),
  ]);
  heeboCache = { regular, bold };
  return heeboCache;
}

function registerHeebo(doc: jsPDF, fonts: { regular: string; bold: string }) {
  doc.addFileToVFS('Heebo-Regular.ttf', fonts.regular);
  doc.addFont('Heebo-Regular.ttf', 'Heebo', 'normal');
  doc.addFileToVFS('Heebo-Bold.ttf', fonts.bold);
  doc.addFont('Heebo-Bold.ttf', 'Heebo', 'bold');
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
  const fonts = await loadHeebo();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  registerHeebo(doc, fonts);
  doc.setFont('Heebo', 'normal');

  const rtl = isRtl(language);
  const baseDir: 'ltr' | 'rtl' = rtl ? 'rtl' : 'ltr';
  const align: 'right' | 'left' = rtl ? 'right' : 'left';
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('Heebo', 'bold');
  doc.setFontSize(16);
  const pageTitle = title || 'ToiletMon Analytics Report';
  doc.text(toVisualOrder(pageTitle, baseDir), pageWidth / 2, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('Heebo', 'normal');
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

    doc.setFont('Heebo', 'bold');
    doc.setFontSize(12);
    const titleX = rtl ? pageWidth - 14 : 14;
    doc.text(toVisualOrder(section.title, baseDir), titleX, yPos, { align });
    yPos += 3;

    autoTable(doc, {
      startY: yPos,
      head: [section.headers.map(h => bidiCell(h, baseDir))],
      body: section.rows.map(r => r.map(v => bidiCell(v, baseDir))),
      theme: 'striped',
      headStyles: { fillColor: [0, 180, 160], textColor: 255, fontStyle: 'bold', font: 'Heebo', halign: align },
      bodyStyles: { font: 'Heebo', halign: align },
      styles: { fontSize: 9, cellPadding: 2, font: 'Heebo', halign: align },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  doc.save(buildFilename(filenamePrefix, 'pdf'));
}
