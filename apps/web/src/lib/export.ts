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

    const sheetName = section.title.replace(/[^\w\u0590-\u05FF ]/g, '').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, buildFilename(filenamePrefix, 'xlsx'));
}

export function exportToPdf(sections: ExportSection[], filenamePrefix = 'analytics', title?: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  const pageTitle = title || 'ToiletMon Analytics Report';
  doc.text(pageTitle, doc.internal.pageSize.getWidth() / 2, 15, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), doc.internal.pageSize.getWidth() / 2, 22, { align: 'center' });

  let yPos = 30;

  for (const section of sections) {
    if (yPos > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      yPos = 15;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(section.title, 14, yPos);
    yPos += 3;

    autoTable(doc, {
      startY: yPos,
      head: [section.headers],
      body: section.rows.map(r => r.map(String)),
      theme: 'striped',
      headStyles: { fillColor: [0, 180, 160], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 2 },
      margin: { left: 14, right: 14 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  doc.save(buildFilename(filenamePrefix, 'pdf'));
}
