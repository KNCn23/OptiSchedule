import * as XLSX from 'xlsx';
import type { Course } from '@/app/data/mockData';
import { registerTurkishFont } from '@/app/features/scheduler/utils/pdfFont';

export const WEEKLY_SLOT_HOURS = 40;

export function durationOf(course: Pick<Course, 'startTime' | 'endTime'>): number {
  return Math.max(0, (parseInt(course.endTime, 10) || 0) - (parseInt(course.startTime, 10) || 0));
}

export function isAnon(name?: string): boolean {
  const normalized = (name || '').toLocaleLowerCase('tr-TR').trim();
  return !normalized || normalized === 'anonim' || normalized === 'atanmamış' || normalized === 'tba';
}

export function noRoom(room?: string): boolean {
  return !room?.trim() || room.trim().toUpperCase() === 'TBA';
}

export function baseCode(code: string): string {
  const dash = code.lastIndexOf('-');
  return dash > 0 ? code.slice(0, dash) : code;
}

export function pct(part: number, whole: number): number {
  return whole ? Math.round((part / whole) * 100) : 0;
}

export type Cell = string | number;

interface ReportSection {
  heading?: string;
  head: string[];
  rows: Cell[][];
}

export async function exportTablePdf(options: {
  fileName: string;
  title: string;
  subtitle?: string;
  sections: ReportSection[];
}): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const font = await registerTurkishFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont(font, 'bold');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(15);
  doc.text(options.title, pageWidth / 2, 40, { align: 'center' });

  let startY = 58;
  if (options.subtitle) {
    doc.setFont(font, 'normal');
    doc.setFontSize(10);
    doc.text(options.subtitle, pageWidth / 2, startY, { align: 'center' });
    startY += 18;
  }

  options.sections.forEach(section => {
    if (section.heading) {
      doc.setFont(font, 'bold');
      doc.setFontSize(11);
      doc.text(section.heading, 24, startY + 12);
      startY += 22;
    }
    autoTable(doc, {
      startY,
      head: [section.head],
      body: section.rows.map(row => row.map(String)),
      theme: 'grid',
      styles: {
        font,
        fontStyle: 'normal',
        fontSize: 9,
        cellPadding: 4,
        lineColor: [0, 0, 0],
        lineWidth: 0.5,
        textColor: [0, 0, 0],
        fillColor: [255, 255, 255],
      },
      headStyles: {
        font,
        fontStyle: 'bold',
        fillColor: [238, 238, 238],
        textColor: [0, 0, 0],
      },
      margin: { left: 24, right: 24 },
    });
    startY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY) + 22;
  });

  doc.save(`${options.fileName}.pdf`);
}

export function exportTableExcel(options: {
  fileName: string;
  sheets: { name: string; title?: string; head: string[]; rows: Cell[][] }[];
}): void {
  const workbook = XLSX.utils.book_new();
  options.sheets.forEach((sheet, index) => {
    const data: Cell[][] = [];
    if (sheet.title) data.push([sheet.title]);
    data.push(sheet.head, ...sheet.rows);
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    worksheet['!cols'] = sheet.head.map(header => ({ wch: Math.max(12, header.length + 4) }));
    XLSX.utils.book_append_sheet(workbook, worksheet, (sheet.name || `Sheet${index + 1}`).slice(0, 31));
  });
  XLSX.writeFile(workbook, `${options.fileName}.xlsx`);
}
