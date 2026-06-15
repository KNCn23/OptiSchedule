import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const databaseRoot = path.join(projectRoot, 'real_deal_database');
const applyChanges = process.argv.includes('--apply');
const inspectCandidates = process.argv.includes('--inspect');
const backupRoot = path.join(os.tmpdir(), 'optisched-before-graduation-project-removal-20260614');

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGraduationProject(value) {
  const text = normalize(value);
  return [
    /^bitirme projesi (?:1|2|i|ii)$/,
    /^graduation project (?:1|2|i|ii)$/,
    /^senior (?:design )?project (?:1|2|i|ii)$/,
  ].some(pattern => pattern.test(text));
}

function spreadsheetFiles(root) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx'))
    .map(entry => path.join(entry.parentPath, entry.name))
    .sort((a, b) => a.localeCompare(b, 'tr'));
}

function matchingRows(sheet) {
  if (!sheet['!ref']) return [];

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const matches = [];

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    const matchedValues = [];
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell && isGraduationProject(cell.v)) matchedValues.push(String(cell.v));
    }
    if (matchedValues.length > 0) {
      matches.push({ row, values: matchedValues });
    }
  }

  return matches;
}

function removeRows(sheet, rows) {
  if (!sheet['!ref'] || rows.length === 0) return;

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rowsToDelete = new Set(rows);
  let targetRow = range.s.r;

  for (let sourceRow = range.s.r; sourceRow <= range.e.r; sourceRow += 1) {
    if (rowsToDelete.has(sourceRow)) continue;

    if (sourceRow !== targetRow) {
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        const sourceAddress = XLSX.utils.encode_cell({ r: sourceRow, c: column });
        const targetAddress = XLSX.utils.encode_cell({ r: targetRow, c: column });
        if (sheet[sourceAddress]) {
          sheet[targetAddress] = { ...sheet[sourceAddress] };
        } else {
          delete sheet[targetAddress];
        }
      }
    }
    targetRow += 1;
  }

  for (let row = targetRow; row <= range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      delete sheet[XLSX.utils.encode_cell({ r: row, c: column })];
    }
  }

  range.e.r -= rows.length;
  sheet['!ref'] = XLSX.utils.encode_range(range);

  if (sheet['!rows']) {
    sheet['!rows'] = sheet['!rows'].filter((_, row) => !rowsToDelete.has(row));
  }

  if (sheet['!merges']) {
    sheet['!merges'] = sheet['!merges']
      .filter(merge => !rows.some(row => row >= merge.s.r && row <= merge.e.r))
      .map(merge => {
        const removedAbove = rows.filter(row => row < merge.s.r).length;
        return {
          s: { ...merge.s, r: merge.s.r - removedAbove },
          e: { ...merge.e, r: merge.e.r - removedAbove },
        };
      });
  }
}

const results = [];
const candidates = new Map();

for (const file of spreadsheetFiles(databaseRoot)) {
  const workbook = XLSX.readFile(file, {
    cellDates: true,
    cellFormula: true,
    cellStyles: true,
  });
  const fileMatches = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (inspectCandidates && sheet['!ref']) {
      const range = XLSX.utils.decode_range(sheet['!ref']);
      for (let row = range.s.r; row <= range.e.r; row += 1) {
        for (let column = range.s.c; column <= range.e.c; column += 1) {
          const value = sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v;
          const normalized = normalize(value);
          if (
            normalized.includes('bitirme')
            || normalized.includes('graduation')
            || normalized.includes('senior project')
            || normalized.includes('capstone')
            || normalized.includes('proje')
            || normalized.includes('project')
          ) {
            const key = String(value);
            candidates.set(key, (candidates.get(key) ?? 0) + 1);
          }
        }
      }
    }
    const matches = matchingRows(sheet);
    if (matches.length === 0) continue;

    fileMatches.push({
      sheet: sheetName,
      rows: matches.map(match => match.row + 1),
      values: matches.flatMap(match => match.values),
    });

    if (applyChanges) {
      removeRows(sheet, matches.map(match => match.row));
    }
  }

  if (fileMatches.length === 0) continue;

  if (applyChanges) {
    const relativePath = path.relative(databaseRoot, file);
    const backupPath = path.join(backupRoot, relativePath);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(file, backupPath);
    XLSX.writeFile(workbook, file, { compression: true });
  }

  results.push({
    file: path.relative(projectRoot, file),
    sheets: fileMatches,
  });
}

console.log(JSON.stringify({
  mode: applyChanges ? 'applied' : 'dry-run',
  backupRoot: applyChanges ? backupRoot : null,
  affectedFiles: results.length,
  removedRows: results.flatMap(result => result.sheets).reduce((sum, sheet) => sum + sheet.rows.length, 0),
  results,
  candidates: inspectCandidates
    ? Array.from(candidates.entries()).map(([value, count]) => ({ value, count }))
    : undefined,
}, null, 2));
