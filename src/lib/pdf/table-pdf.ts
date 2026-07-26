import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Exports tabular data (the same rows already used for CSV export on the
 * Sales, Audit, and Reports pages) as a downloadable, properly formatted
 * PDF — using jspdf-autotable for column layout so long tables paginate
 * correctly instead of running off a single page.
 */
export function downloadTablePDF({
  title,
  subtitle,
  headers,
  rows,
  filename,
}: {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  filename: string;
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 40, 40);

  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(subtitle, 40, 58);
    doc.setTextColor(0);
  }

  autoTable(doc, {
    head: [headers],
    body: rows.map((r) => r.map((cell) => String(cell))),
    startY: subtitle ? 72 : 56,
    margin: { left: 40, right: 40 },
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [99, 102, 241] }, // matches TradeTrack's --primary/theme-color
    alternateRowStyles: { fillColor: [245, 245, 250] },
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
