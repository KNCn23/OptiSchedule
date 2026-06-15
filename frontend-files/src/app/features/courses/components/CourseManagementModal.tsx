import { X, Search, Plus, Minus, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download, BookOpen, ArrowRight, ChevronLeft, Building2, Check } from 'lucide-react';
import { useApp } from '@/app/context/AppContext';
import { useLocale } from '@/app/i18n';
import { useState, useRef, useMemo, useEffect, type DragEvent } from 'react';
import * as XLSX from 'xlsx';
import type { AlgorithmInput } from '@/app/features/scheduler/types/schedulerTypes';
import { DEPARTMENTS, departmentName } from '@/app/data/departments';

/**
 * Excel format (Başkent "WEB HALİ" exports): one row PER SECTION (şube).
 *   Ders Kodu | Ders Adı | Şube | Kredi | AKTS | Kontenjan | Sınıf Mevcudu | Öğretim Görevlisi
 * Rows are grouped by course code → section_count = number of şube rows.
 */
type SecField = 'code' | 'name' | 'section' | 'credit' | 'theory' | 'lab' | 'instructor' | 'capacity' | 'enrolled';

// ── Header → section field mapping (normalized lowercase, accents kept) ──
const COL_MAP: Record<string, SecField> = {
  // Ders Kodu
  'ders kodu': 'code', ders_kodu: 'code', course_code: 'code', code: 'code', kod: 'code',
  // Ders Adı
  'ders adı': 'name', 'ders adi': 'name', ders_adi: 'name', course_name: 'name', name: 'name', ad: 'name',
  // Şube (section number)
  'şube': 'section', sube: 'section', section: 'section', 'şube no': 'section', 'sube no': 'section',
  // Kredi → weekly hours proxy
  kredi: 'credit', credit: 'credit', weekly_hours: 'credit', 'haftalık saat': 'credit', 'haftalik saat': 'credit', saat: 'credit', hours: 'credit',
  t_hour: 'theory', 'teorik saat': 'theory', teorik: 'theory',
  l_hour: 'lab', 'laboratuvar saati': 'lab', uygulama: 'lab',
  // Öğretim Görevlisi
  'öğretim görevlisi': 'instructor', 'ogretim gorevlisi': 'instructor', 'öğretim elemanı': 'instructor', 'ogretim elemani': 'instructor', instructor: 'instructor', hoca: 'instructor', instructor_full_name: 'instructor',
  // Kontenjan / Sınıf Mevcudu (read, informational)
  kontenjan: 'capacity', capacity: 'capacity',
  'sınıf mevcudu': 'enrolled', 'sinif mevcudu': 'enrolled', enrolled: 'enrolled',
};

interface ParsedRow {
  data: Partial<AlgorithmInput>;
  errors: string[];
  rowIndex: number;
}

/** Derive the academic semester (1–8) from a course code + selected term.
 *  Hundreds-style first digit = class year; spring → even semester, fall → odd. */
function deriveSemester(code: string, term: 'fall' | 'spring'): number {
  const m = code.match(/\d/);
  let year = m ? parseInt(m[0]) : 1;
  if (year < 1 || year > 4) year = 1;
  return term === 'fall' ? year * 2 - 1 : year * 2;
}

type ModalView = 'department' | 'choose' | 'catalog' | 'excel' | 'custom';

const EMPTY_CUSTOM = {
  course_code: '', course_name: '', weekly_hours: '3', course_semester: '',
  section_count: '1', instructor_full_name: '', is_online: false, is_service: false,
};

// Readable department names for the catalog dropdown (fallback = code prefix).
const DEPT_NAMES: Record<string, string> = {
  'BİL': 'Bilgisayar Mühendisliği',
  'MAT': 'Matematik',
  'ENG': 'İngilizce',
  'FİZ': 'Fizik',
  'SOS': 'Sosyal / Seçmeli',
};

function deptOf(code: string): string {
  const m = code.match(/^[^0-9]+/);
  return (m ? m[0] : code).trim().toUpperCase();
}

function isGraduationProject(name: string): boolean {
  const normalized = name
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(bitirme projesi|graduation project)\s+(1|2|i|ii)\b/.test(normalized);
}

export function CourseManagementModal({ onProceed }: { onProceed?: () => void }) {
  const {
    darkMode,
    isManageModalOpen,
    setIsManageModalOpen,
    algorithmCourses,
    updateCourseSection,
    importCourses,
    addCustomCourse,
    selectedCourseCodes,
    toggleCourseSelection,
    selectCourses,
    deselectCourse,
    selectedTerm,
    selectedDepartment,
    setSelectedDepartment,
    currentUser,
  } = useApp();
  // Dept-locked roles can't change the program department, so skip the picker.
  const deptLocked = currentUser?.role === 'coordinator' || currentUser?.role === 'secretary';
  const { t } = useLocale();
  const cm = t.courseManage;

  // View state: choose mode → catalog split / excel upload
  const [view, setView] = useState<ModalView>('choose');

  // Catalog state
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Custom ("katalog dışı") course form state
  const [customForm, setCustomForm] = useState({ ...EMPTY_CUSTOM });
  const [customError, setCustomError] = useState('');

  // Excel upload state
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importDone, setImportDone] = useState(false);
  const [importCount, setImportCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chooseFileInputRef = useRef<HTMLInputElement>(null);

  const eligibleCourses = useMemo(() => algorithmCourses.filter(course => {
    const belongsToDepartment = (course.department_codes ?? []).includes(selectedDepartment);
    const belongsToTerm = selectedTerm === 'fall'
      ? course.course_semester % 2 === 1
      : course.course_semester % 2 === 0;
    return belongsToDepartment && belongsToTerm;
  }), [algorithmCourses, selectedDepartment, selectedTerm]);

  const departments = useMemo(() => {
    const set = new Set(eligibleCourses.map(c => deptOf(c.course_code)));
    return [...set].sort();
  }, [eligibleCourses]);

  const selectedSet = useMemo(() => new Set(selectedCourseCodes), [selectedCourseCodes]);

  // Left column: catalog courses for the chosen department, not yet opened.
  const catalogCourses = useMemo(() => {
    if (!selectedDept) return [];
    const q = searchQuery.toLowerCase();
    return eligibleCourses.filter(c =>
      deptOf(c.course_code) === selectedDept &&
      !selectedSet.has(c.course_code) &&
      (!q || c.course_code.toLowerCase().includes(q) || c.course_name.toLowerCase().includes(q))
    );
  }, [eligibleCourses, selectedDept, selectedSet, searchQuery]);

  // Right column: every opened course (across all departments).
  const openedCourses = useMemo(
    () => algorithmCourses.filter(c => selectedSet.has(c.course_code)),
    [algorithmCourses, selectedSet]
  );

  // Start at the department picker — except dept-locked roles, whose department
  // is already fixed, so jump straight to the mode chooser.
  useEffect(() => {
    if (isManageModalOpen) {
      setView(deptLocked ? 'choose' : 'department');
      setParsedRows([]);
      setImportDone(false);
    }
  }, [isManageModalOpen, deptLocked]);

  if (!isManageModalOpen) return null;

  const errorCount = parsedRows.filter(r => r.errors.length > 0).length;
  const validRows = parsedRows.filter(r => r.errors.length === 0);

  function deptLabel(code: string) {
    return DEPT_NAMES[code] ? `${code} · ${DEPT_NAMES[code]}` : code;
  }

  function closeModal() {
    setIsManageModalOpen(false);
  }

  function handleProceed() {
    setIsManageModalOpen(false);
    onProceed?.();
  }

  function addAllInDept() {
    selectCourses(catalogCourses.map(c => c.course_code));
  }

  function openCustomForm() {
    setCustomForm({ ...EMPTY_CUSTOM });
    setCustomError('');
    setView('custom');
  }

  function submitCustomCourse() {
    const code = customForm.course_code.trim().toUpperCase().replace(/\s+/g, '');
    const name = customForm.course_name.trim();
    const hours = parseInt(customForm.weekly_hours) || 0;
    if (!code || !name || hours <= 0) {
      setCustomError(cm.customRequired);
      return;
    }
    if (algorithmCourses.some(c => c.course_code === code)) {
      setCustomError(cm.customDuplicate);
      return;
    }
    const semester = parseInt(customForm.course_semester) || deriveSemester(code, selectedTerm);
    addCustomCourse({
      course_id: 0, // assigned in context
      course_code: code,
      course_name: name,
      weekly_hours: hours,
      course_semester: Math.min(8, Math.max(1, semester)),
      section_count: Math.max(1, parseInt(customForm.section_count) || 1),
      instructor_full_name: customForm.instructor_full_name.trim() || 'anonim',
      is_online: customForm.is_online,
      is_service: customForm.is_service,
    });
    // Land back on the catalog split so the new (opened) course shows on the right.
    setSelectedDept(deptOf(code));
    setView('catalog');
  }

  // ── Excel parsing ──
  // Each spreadsheet row is one section (şube); rows are grouped by course code.
  function parseFile(file: File) {
    setView('excel');
    setIsParsing(true);
    setImportDone(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

        // 1) Read each row into a section record using the header map.
        //    `section` keeps the RAW Şube label (trimmed) — not parsed to a number
        //    — so the count below stays faithful to the Şube column and also
        //    handles letter-suffixed şubeler ("1A", "1B").
        interface Sec { code: string; name: string; section: string; credit: number; theory: number; lab: number; instructor: string; rowIndex: number }
        const sections: Sec[] = [];
        json.forEach((raw, idx) => {
          const rec: Partial<Record<SecField, string>> = {};
          for (const [key, value] of Object.entries(raw)) {
            const normalized = key.trim().toLowerCase().replace(/\s+/g, ' ');
            const field = COL_MAP[normalized];
            if (field && rec[field] === undefined) rec[field] = String(value).trim();
          }
          const code = (rec.code ?? '').toUpperCase().replace(/\s+/g, '');
          if (!code) return; // skip blank/footer rows
          if (isGraduationProject(rec.name ?? '')) return;
          sections.push({
            code,
            name: rec.name ?? '',
            section: (rec.section ?? '').trim(),
            credit: parseInt(rec.credit ?? '') || 0,
            theory: parseInt(rec.theory ?? '') || 0,
            lab: parseInt(rec.lab ?? '') || 0,
            instructor: rec.instructor ?? '',
            rowIndex: idx + 2,
          });
        });

        // 2) Group sections by course code.
        const groups = new Map<string, Sec[]>();
        for (const s of sections) {
          if (!groups.has(s.code)) groups.set(s.code, []);
          groups.get(s.code)!.push(s);
        }

        // 3) Build one ParsedRow per course (grouped).
        const rows: ParsedRow[] = [...groups.entries()].map(([code, secs]) => {
          const first = secs[0];
          // Section count = number of DISTINCT non-empty Şube labels (so duplicate
          // rows for the same şube don't inflate it). Only when the Şube column is
          // entirely empty for this course do we fall back to the raw row count.
          const subeLabels = new Set(secs.map(s => s.section).filter(Boolean));
          const sectionCount = subeLabels.size > 0 ? subeLabels.size : secs.length;
          // representative instructor: the single one if uniform, else "anonim" (pool)
          const instructors = [...new Set(secs.map(s => s.instructor).filter(Boolean))];
          const instructor = instructors.length === 1 ? instructors[0] : 'anonim';
          const credit = Math.max(...secs.map(s => s.credit), 0);
          const theory = Math.max(...secs.map(s => s.theory), 0);
          const lab = Math.max(...secs.map(s => s.lab), 0);
          const totalHours = theory + lab > 0 ? theory + lab : credit;

          const data: Partial<AlgorithmInput> = {
            course_id: 0,
            course_code: code,
            course_name: first.name,
            weekly_hours: totalHours,
            t_hour: theory,
            l_hour: lab,
            course_semester: deriveSemester(code, selectedTerm),
            section_count: sectionCount,
            instructor_full_name: instructor || 'anonim',
            is_online: false,
            is_service: false,
            is_common: false,
            course_type_id: 1,
            expected_student: 0,
            department_codes: [selectedDepartment],
            section_instructors: instructors.length === 1
              ? Array(sectionCount).fill(instructor)
              : secs
                  .slice()
                  .sort((a, b) => (parseInt(a.section) || 0) - (parseInt(b.section) || 0))
                  .map(s => s.instructor || 'anonim'),
          };

          const errors: string[] = [];
          if (!data.course_code) errors.push('course_code');
          if (!data.course_name) errors.push('course_name');
          if (!data.weekly_hours || data.weekly_hours <= 0) errors.push('weekly_hours');

          return { data, errors, rowIndex: first.rowIndex };
        });

        setParsedRows(rows);
      } catch {
        setParsedRows([]);
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleDropOnExcelButton(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      parseFile(file);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  }

  function handleImport() {
    const toImport = validRows.map(r => r.data as AlgorithmInput);
    importCourses(toImport); // adds to catalog AND opens them (right panel)
    setImportCount(toImport.length);
    setImportDone(true);
    // Show the catalog split view so the imported courses appear on the right.
    setTimeout(() => {
      setParsedRows([]);
      setImportDone(false);
      setView('catalog');
    }, 1400);
  }

  function handleClear() {
    setParsedRows([]);
    setImportDone(false);
  }

  function downloadTemplate() {
    // One row per section (şube); rows are grouped by course code on import.
    const headers = ['Ders Kodu', 'Ders Adı', 'Şube', 'Kredi', 'AKTS', 'Kontenjan', 'Sınıf Mevcudu', 'Öğretim Görevlisi'];
    const examples = [
      ['BİL101', 'BİLGİSAYAR YAZILIMI I', 1, 3, 5, 40, 38, 'Öğr. Gör. Ad Soyad'],
      ['BİL101', 'BİLGİSAYAR YAZILIMI I', 2, 3, 5, 40, 35, 'Dr. Öğr. Üyesi Ad Soyad'],
      ['BİL105', 'PROGRAMLAMA LABORATUVARI I', 1, 1, 2, 25, 22, 'Öğr. Gör. Ad Soyad'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
    ws['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 7 }, { wch: 7 }, { wch: 7 }, { wch: 10 }, { wch: 13 }, { wch: 28 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dersler');
    XLSX.writeFile(wb, 'ders_sablonu.xlsx');
  }

  const border = 'var(--border-light)';
  const surface = 'var(--bg-surface)';
  const text = 'var(--text-primary)';
  const muted = 'var(--text-muted)';
  const faint = 'var(--text-faint)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={closeModal}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: surface }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--bg-mute)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {view !== 'department' && !(deptLocked && view === 'choose') && (
              <button
                onClick={() => {
                  if (view === 'choose') setView('department');
                  else if (view === 'custom') setView('catalog');
                  else { setView('choose'); setParsedRows([]); setImportDone(false); }
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
                style={{ color: muted }}
                title={view === 'choose' ? cm.changeDept : cm.backToModes}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate" style={{ color: text }}>
                {t.stepper.stepCourses}
              </h2>
              <p className="text-xs mt-0.5 truncate" style={{ color: faint }}>
                {view === 'department'
                  ? cm.deptStepDesc
                  : `${cm.department}: ${departmentName(selectedDepartment)}`}
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/5 shrink-0"
            style={{ color: faint }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ═══════════════ VIEW: Department picker (first step) ═══════════════ */}
        {view === 'department' && (
          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="text-base font-bold text-center mb-1" style={{ color: text }}>
              {cm.deptStepTitle}
            </h3>
            <p className="text-sm text-center mb-6 max-w-xl mx-auto" style={{ color: muted }}>
              {cm.deptStepDesc}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {DEPARTMENTS.map(dep => {
                const active = selectedDepartment === dep.code;
                return (
                  <button
                    key={dep.code}
                    onClick={() => { setSelectedDepartment(dep.code); setView('choose'); }}
                    className="flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      borderColor: active ? 'var(--brand-primary)' : border,
                      backgroundColor: active
                        ? (darkMode ? 'rgba(59,130,246,0.1)' : 'rgba(60,141,188,0.08)')
                        : (darkMode ? '#1e293b' : '#fff'),
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: active ? 'var(--brand-primary)' : 'var(--bg-mute)' }}
                    >
                      {active
                        ? <Check className="w-5 h-5 text-white" />
                        : <Building2 className="w-5 h-5" style={{ color: muted }} />}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--border-light)', color: muted }}>
                        {dep.code}
                      </span>
                      <p className="text-sm font-semibold mt-1 leading-tight" style={{ color: text }}>{dep.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════════════ VIEW: Mode chooser ═══════════════ */}
        {view === 'choose' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}>
                {departmentName(selectedDepartment)}
              </span>
              {!deptLocked && (
                <button onClick={() => setView('department')} className="text-xs font-semibold underline" style={{ color: muted }}>
                  {cm.changeDept}
                </button>
              )}
            </div>
            <h3 className="text-base font-bold text-center mb-1" style={{ color: text }}>
              {cm.modeChooseTitle}
            </h3>
            <p className="text-sm text-center mb-6" style={{ color: muted }}>
              {cm.modeChooseDesc}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Catalog button */}
              <button
                onClick={() => setView('catalog')}
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 p-8 text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  borderColor: 'var(--brand-primary)',
                  backgroundColor: darkMode ? 'rgba(59,130,246,0.06)' : 'rgba(60,141,188,0.05)',
                }}
              >
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: 'var(--brand-primary-soft)' }}
                >
                  <BookOpen className="w-8 h-8" style={{ color: 'var(--brand-primary)' }} />
                </div>
                <div>
                  <h4 className="text-base font-bold" style={{ color: text }}>{cm.modeCatalog}</h4>
                  <p className="text-xs mt-1" style={{ color: muted }}>{cm.modeCatalogDesc}</p>
                </div>
              </button>

              {/* Excel button = drop zone + click to browse */}
              <button
                onClick={() => chooseFileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDropOnExcelButton}
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  borderColor: isDragging ? '#16a34a' : border,
                  backgroundColor: isDragging
                    ? (darkMode ? 'rgba(22,163,74,0.1)' : 'rgba(22,163,74,0.05)')
                    : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
                }}
              >
                <input
                  ref={chooseFileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{
                    backgroundColor: isDragging
                      ? (darkMode ? 'rgba(22,163,74,0.2)' : '#dcfce7')
                      : (darkMode ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                  }}
                >
                  <Upload className="w-8 h-8" style={{ color: isDragging ? '#16a34a' : muted }} />
                </div>
                <div>
                  <h4 className="text-base font-bold" style={{ color: text }}>{cm.modeExcel}</h4>
                  <p className="text-xs mt-1" style={{ color: muted }}>{cm.modeExcelDesc}</p>
                </div>
              </button>
            </div>

            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 mx-auto mt-5 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                backgroundColor: darkMode ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                color: muted,
                border: `1px solid ${border}`,
              }}
            >
              <Download className="w-3.5 h-3.5" />
              {cm.excelDownloadTemplate}
            </button>
          </div>
        )}

        {/* ═══════════════ VIEW: Catalog split ═══════════════ */}
        {view === 'catalog' && (
          <div className="flex flex-1 overflow-hidden">
            {/* LEFT: catalog */}
            <div className="w-1/2 flex flex-col border-r overflow-hidden" style={{ borderColor: border }}>
              <div className="p-3 border-b shrink-0 space-y-2" style={{ borderColor: border, backgroundColor: 'var(--bg-mute)' }}>
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: faint }}>
                  {cm.catalogColTitle}
                </span>
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border text-sm font-medium outline-none cursor-pointer"
                  style={{ backgroundColor: surface, borderColor: border, color: text }}
                >
                  <option value="">{cm.catalogSelectDept}</option>
                  {departments.map(d => (
                    <option key={d} value={d}>{deptLabel(d)}</option>
                  ))}
                </select>
                {selectedDept && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: faint }} />
                    <input
                      type="text"
                      placeholder={cm.searchPlaceholder}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-none"
                      style={{ backgroundColor: surface, borderColor: border, color: text }}
                    />
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {!selectedDept ? (
                  <div className="flex items-center justify-center h-full text-center px-4">
                    <p className="text-sm" style={{ color: faint }}>{cm.catalogPickDept}</p>
                  </div>
                ) : catalogCourses.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-center px-4">
                    <p className="text-sm" style={{ color: faint }}>{cm.catalogNoneLeft}</p>
                  </div>
                ) : (
                  <div className="grid gap-1">
                    {catalogCourses.map(course => (
                      <button
                        key={course.course_code}
                        onClick={() => toggleCourseSelection(course.course_code)}
                        title={cm.clickToAdd}
                        className="flex items-center gap-2 p-2.5 rounded-xl transition-colors text-left group hover:bg-black/5 dark:hover:bg-white/5"
                        style={{ border: `1px solid ${border}`, backgroundColor: darkMode ? '#1e293b' : '#fff' }}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--border-light)', color: muted }}>
                              {course.course_code}
                            </span>
                            <h3 className="text-xs font-semibold truncate" style={{ color: text }}>
                              {course.course_name}
                            </h3>
                          </div>
                          <p className="text-[10px] mt-0.5 truncate" style={{ color: faint }}>
                            {course.weekly_hours} {cm.hoursPerWeek} · {course.course_semester}. {cm.semester}
                          </p>
                        </div>
                        <Plus className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-2 border-t shrink-0 space-y-1" style={{ borderColor: border }}>
                {selectedDept && catalogCourses.length > 0 && (
                  <button
                    onClick={addAllInDept}
                    className="w-full text-xs font-semibold py-1.5 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ color: 'var(--brand-primary)' }}
                  >
                    + {cm.addAllDept}
                  </button>
                )}
                {/* Add a course that isn't in the catalog (persisted for reuse). */}
                <button
                  onClick={openCustomForm}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg border border-dashed transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: muted, borderColor: border }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {cm.addCustom}
                </button>
              </div>
            </div>

            {/* RIGHT: opened courses */}
            <div className="w-1/2 flex flex-col overflow-hidden">
              <div className="p-3 border-b shrink-0 flex items-center justify-between" style={{ borderColor: border, backgroundColor: 'var(--bg-mute)' }}>
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: faint }}>
                  {cm.selectedColTitle}
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--brand-on-primary)' }}>
                  {openedCourses.length}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {openedCourses.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-center px-6">
                    <p className="text-sm" style={{ color: faint }}>{cm.selectedEmpty}</p>
                  </div>
                ) : (
                  <div className="grid gap-1">
                    {openedCourses.map(course => (
                      <div
                        key={course.course_code}
                        className="flex items-center gap-2 p-2.5 rounded-xl"
                        style={{ border: `1px solid ${border}`, backgroundColor: darkMode ? '#1e293b' : '#fff' }}
                      >
                        <button
                          onClick={() => deselectCourse(course.course_code)}
                          title={cm.clickToRemove}
                          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          style={{ color: '#ef4444' }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--border-light)', color: muted }}>
                              {course.course_code}
                            </span>
                            <h3 className="text-xs font-semibold truncate" style={{ color: text }}>
                              {course.course_name}
                            </h3>
                          </div>
                        </div>
                        {/* Section counter */}
                        <div className="flex items-center shrink-0">
                          <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 rounded-full p-0.5" style={{ border: `1px solid ${border}` }} title={cm.sections}>
                            <button
                              onClick={() => updateCourseSection(course.course_code, -1)}
                              className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10"
                              style={{ color: text }}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-bold w-3 text-center" style={{ color: text }}>{course.section_count}</span>
                            <button
                              onClick={() => updateCourseSection(course.course_code, 1)}
                              className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10"
                              style={{ color: text }}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ VIEW: Excel upload ═══════════════ */}
        {view === 'excel' && (
          <div className="flex-1 overflow-y-auto p-6">
            {importDone && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-xl mb-4"
                style={{ backgroundColor: darkMode ? '#052e16' : '#f0fdf4', color: '#16a34a', fontSize: '13px', fontWeight: 600 }}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {cm.excelImportSuccess.replace('{n}', String(importCount))}
              </div>
            )}

            {parsedRows.length === 0 && !isParsing && !importDone && (
              <div
                className="relative rounded-2xl border-2 border-dashed p-10 text-center transition-all cursor-pointer"
                style={{
                  borderColor: isDragging ? '#16a34a' : border,
                  backgroundColor: isDragging
                    ? (darkMode ? 'rgba(22,163,74,0.08)' : 'rgba(22,163,74,0.04)')
                    : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
                }}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDropOnExcelButton}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: isDragging ? (darkMode ? 'rgba(22,163,74,0.2)' : '#dcfce7') : (darkMode ? 'rgba(255,255,255,0.06)' : '#f1f5f9') }}>
                  <Upload className="w-7 h-7" style={{ color: isDragging ? '#16a34a' : muted }} />
                </div>
                <h3 className="text-base font-bold mb-1" style={{ color: text }}>{cm.excelDropTitle}</h3>
                <p className="text-sm mb-2" style={{ color: muted }}>{cm.excelDropDesc}</p>
                <p className="text-xs" style={{ color: faint }}>{cm.excelAccepted}</p>
              </div>
            )}

            {isParsing && (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mr-3" style={{ borderColor: '#16a34a', borderTopColor: 'transparent' }} />
                <span className="text-sm font-medium" style={{ color: muted }}>{cm.excelParsing}</span>
              </div>
            )}

            {parsedRows.length > 0 && !isParsing && !importDone && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold" style={{ color: text }}>{cm.excelPreviewTitle}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ backgroundColor: darkMode ? 'rgba(59,130,246,0.15)' : '#eff6ff', color: '#3b82f6' }}>
                      {cm.excelRowsRead.replace('{n}', String(parsedRows.length))}
                    </span>
                    <span className="text-xs font-medium px-2 py-1 rounded-full" style={{
                      backgroundColor: errorCount > 0 ? (darkMode ? 'rgba(239,68,68,0.15)' : '#fef2f2') : (darkMode ? 'rgba(22,163,74,0.15)' : '#f0fdf4'),
                      color: errorCount > 0 ? '#ef4444' : '#16a34a',
                    }}>
                      {errorCount > 0 ? cm.excelErrors.replace('{n}', String(errorCount)) : cm.excelNoErrors}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border overflow-hidden mb-4" style={{ borderColor: border }}>
                  <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-mute)' }}>
                          <th className="px-3 py-2 text-left font-semibold" style={{ color: muted }}>#</th>
                          <th className="px-3 py-2 text-left font-semibold" style={{ color: muted }}>{cm.excelColCode}</th>
                          <th className="px-3 py-2 text-left font-semibold" style={{ color: muted }}>{cm.excelColName}</th>
                          <th className="px-3 py-2 text-center font-semibold" style={{ color: muted }}>{cm.excelColHours}</th>
                          <th className="px-3 py-2 text-center font-semibold" style={{ color: muted }}>{cm.excelColSemester}</th>
                          <th className="px-3 py-2 text-center font-semibold" style={{ color: muted }}>{cm.excelColSections}</th>
                          <th className="px-3 py-2 text-left font-semibold" style={{ color: muted }}>{cm.excelColInstructor}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.map((row, i) => {
                          const hasError = row.errors.length > 0;
                          return (
                            <tr key={i} style={{
                              backgroundColor: hasError ? (darkMode ? 'rgba(239,68,68,0.08)' : '#fef2f2') : (i % 2 === 0 ? 'transparent' : (darkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)')),
                              borderBottom: `1px solid ${border}`,
                            }}>
                              <td className="px-3 py-2" style={{ color: faint }}>
                                <div className="flex items-center gap-1">
                                  {hasError && <AlertCircle className="w-3 h-3 shrink-0" style={{ color: '#ef4444' }} />}
                                  {row.rowIndex}
                                </div>
                              </td>
                              <td className="px-3 py-2 font-bold" style={{ color: row.errors.includes('course_code') ? '#ef4444' : text }}>{row.data.course_code || '—'}</td>
                              <td className="px-3 py-2" style={{ color: row.errors.includes('course_name') ? '#ef4444' : text }}>{row.data.course_name || '—'}</td>
                              <td className="px-3 py-2 text-center" style={{ color: row.errors.includes('weekly_hours') ? '#ef4444' : text }}>{row.data.weekly_hours || '—'}</td>
                              <td className="px-3 py-2 text-center" style={{ color: row.errors.includes('course_semester') ? '#ef4444' : text }}>{row.data.course_semester || '—'}</td>
                              <td className="px-3 py-2 text-center" style={{ color: text }}>{row.data.section_count || 1}</td>
                              <td className="px-3 py-2" style={{ color: faint }}>{row.data.instructor_full_name || 'anonim'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={handleClear} className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/5" style={{ color: muted }}>
                    {cm.excelClear}
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={validRows.length === 0}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: validRows.length > 0 ? 'linear-gradient(135deg, #16a34a, #15803d)' : '#9ca3af' }}
                  >
                    <Upload className="w-4 h-4" />
                    {cm.excelImport} ({validRows.length})
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════ VIEW: Add non-catalog course ═══════════════ */}
        {view === 'custom' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-xl mx-auto">
              <h3 className="text-base font-bold mb-1" style={{ color: text }}>{cm.customTitle}</h3>
              <p className="text-sm mb-5" style={{ color: muted }}>{cm.customDesc}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Code */}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: faint }}>{cm.customCode} *</label>
                  <input
                    type="text"
                    value={customForm.course_code}
                    onChange={e => { setCustomForm(f => ({ ...f, course_code: e.target.value })); setCustomError(''); }}
                    placeholder="BİL299"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ backgroundColor: surface, borderColor: border, color: text }}
                  />
                </div>
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: faint }}>{cm.customName} *</label>
                  <input
                    type="text"
                    value={customForm.course_name}
                    onChange={e => { setCustomForm(f => ({ ...f, course_name: e.target.value })); setCustomError(''); }}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ backgroundColor: surface, borderColor: border, color: text }}
                  />
                </div>
                {/* Weekly hours */}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: faint }}>{cm.customHours} *</label>
                  <input
                    type="number" min={1} max={12}
                    value={customForm.weekly_hours}
                    onChange={e => { setCustomForm(f => ({ ...f, weekly_hours: e.target.value })); setCustomError(''); }}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ backgroundColor: surface, borderColor: border, color: text }}
                  />
                </div>
                {/* Semester */}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: faint }}>{cm.customSemester}</label>
                  <input
                    type="number" min={1} max={8}
                    value={customForm.course_semester}
                    onChange={e => setCustomForm(f => ({ ...f, course_semester: e.target.value }))}
                    placeholder={String(customForm.course_code ? deriveSemester(customForm.course_code, selectedTerm) : '')}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ backgroundColor: surface, borderColor: border, color: text }}
                  />
                </div>
                {/* Section count */}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: faint }}>{cm.customSections}</label>
                  <input
                    type="number" min={1} max={20}
                    value={customForm.section_count}
                    onChange={e => setCustomForm(f => ({ ...f, section_count: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ backgroundColor: surface, borderColor: border, color: text }}
                  />
                </div>
                {/* Instructor */}
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: faint }}>{cm.customInstructor}</label>
                  <input
                    type="text"
                    value={customForm.instructor_full_name}
                    onChange={e => setCustomForm(f => ({ ...f, instructor_full_name: e.target.value }))}
                    placeholder={cm.customInstructorPlaceholder}
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ backgroundColor: surface, borderColor: border, color: text }}
                  />
                </div>
              </div>

              {/* Flags */}
              <div className="flex items-center gap-5 mt-4">
                {([['is_online', cm.customOnline], ['is_service', cm.customService]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setCustomForm(f => ({ ...f, [key]: !f[key] }))}
                    className="flex items-center gap-2 text-sm font-medium"
                    style={{ color: text }}
                  >
                    <span className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: customForm[key] ? 'var(--brand-primary)' : 'transparent', border: `2px solid ${customForm[key] ? 'var(--brand-primary)' : border}` }}>
                      {customForm[key] && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>
                    {label}
                  </button>
                ))}
              </div>

              {customError && (
                <div className="flex items-center gap-1.5 mt-4 text-xs font-medium" style={{ color: '#ef4444' }}>
                  <AlertCircle className="w-3.5 h-3.5" />{customError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={() => setView('catalog')}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: muted }}
                >
                  {t.close}
                </button>
                <button
                  onClick={submitCustomCourse}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-md transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'var(--brand-gradient)' }}
                >
                  <Plus className="w-4 h-4" />
                  {cm.customSave}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer (hidden on the department picker + custom form — they have their own actions) */}
        {view !== 'department' && view !== 'custom' && (
        <div
          className="px-6 py-4 border-t shrink-0 flex items-center justify-between"
          style={{ backgroundColor: surface, borderColor: 'var(--bg-mute)' }}
        >
          <p className="text-xs" style={{ color: faint }}>
            {cm.selectedCount.replace('{n}', String(openedCourses.length))}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={closeModal}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ color: muted }}
            >
              {t.close}
            </button>
            <button
              onClick={handleProceed}
              disabled={openedCourses.length === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white shadow-md transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: openedCourses.length > 0 ? 'var(--brand-gradient)' : '#9ca3af' }}
            >
              {cm.proceed}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
