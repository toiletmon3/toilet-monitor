import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

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

export async function exportToPdf(sections: ExportSection[], filenamePrefix = 'analytics', title?: string) {
  const fonts = await loadHeebo();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  registerHeebo(doc, fonts);
  doc.setFont('Heebo', 'normal');

  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('Heebo', 'bold');
  doc.setFontSize(16);
  const pageTitle = title || 'ToiletMon Analytics Report';
  doc.text(pageTitle, pageWidth / 2, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('Heebo', 'normal');
  doc.text(
    new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' }),
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
    doc.text(section.title, pageWidth - 14, yPos, { align: 'right' });
    yPos += 3;

    autoTable(doc, {
      startY: yPos,
      head: [section.headers],
      body: section.rows.map(r => r.map(String)),
      theme: 'striped',
      headStyles: { fillColor: [0, 180, 160], textColor: 255, fontStyle: 'bold', font: 'Heebo', halign: 'right' },
      bodyStyles: { font: 'Heebo', halign: 'right' },
      styles: { fontSize: 9, cellPadding: 2, font: 'Heebo', halign: 'right' },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  doc.save(buildFilename(filenamePrefix, 'pdf'));
}
