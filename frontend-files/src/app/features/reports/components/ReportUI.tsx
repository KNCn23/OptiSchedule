import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, Lightbulb } from 'lucide-react';

export function Insight({ tone = 'info', children }: { tone?: 'good' | 'warn' | 'info'; children: ReactNode }) {
  const color = tone === 'good' ? '#16a34a' : tone === 'warn' ? '#f59e0b' : 'var(--brand-primary)';
  const Icon = tone === 'good' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : Lightbulb;
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-5" style={{ backgroundColor: `${color}14`, border: `1px solid ${color}55` }}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />
      <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>{children}</p>
    </div>
  );
}

export function ReportHeader({
  title, desc, onPdf, onExcel, disabled,
}: {
  title: string; desc: string; onPdf: () => void; onExcel: () => void; disabled?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
      <div>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ExportButton icon={<FileText className="w-3.5 h-3.5" />} label="PDF" onClick={onPdf} disabled={disabled} />
        <ExportButton icon={<FileSpreadsheet className="w-3.5 h-3.5" />} label="Excel" onClick={onExcel} disabled={disabled} />
      </div>
    </div>
  );
}

function ExportButton({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 h-9 px-3 rounded-lg font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ fontSize: '13px', backgroundColor: 'var(--bg-mute)', color: 'var(--text-muted)', border: '1px solid var(--border-light)' }}
    >
      {icon}{label}
    </button>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">{children}</div>;
}

export function StatCard({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: string }) {
  return (
    <div className="p-3.5 rounded-xl border" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: '22px', fontWeight: 700, color: accent ?? 'var(--text-primary)', lineHeight: 1.1, marginTop: 4 }}>{value}</p>
      {hint && <p className="truncate" style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: 2 }}>{hint}</p>}
    </div>
  );
}

export function ReportCard({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border overflow-hidden mb-5" style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-light)' }}>{children}</div>;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-2.5 border-b" style={{ borderColor: 'var(--border-light)' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{children}</span>
    </div>
  );
}

export function BarRow({ label, value, max, display, color }: { label: string; value: number; max: number; display?: string; color?: string }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="truncate" style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>{label}</span>
        <span className="shrink-0" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>{display ?? value}</span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 6, backgroundColor: 'var(--bg-mute)' }}>
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color ?? 'var(--brand-primary)' }} />
      </div>
    </div>
  );
}

export function ReportTable({ head, rows, align }: { head: string[]; rows: ReactNode[][]; align?: ('left' | 'right' | 'center')[] }) {
  const alignment = (index: number) => align?.[index] ?? (index === 0 ? 'left' : 'right');
  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-mute)' }}>
            {head.map((header, index) => (
              <th key={header} className="px-3 py-2 whitespace-nowrap" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textAlign: alignment(index), textTransform: 'uppercase' }}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t" style={{ borderColor: 'var(--border-light)' }}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 whitespace-nowrap" style={{ fontSize: '12px', color: 'var(--text-primary)', textAlign: alignment(cellIndex) }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pill({ label, color }: { label: string; color: string }) {
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: `${color}22`, color }}>{label}</span>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="px-4 py-2.5 border-t" style={{ fontSize: '11px', color: 'var(--text-faint)', lineHeight: 1.5, borderColor: 'var(--border-light)' }}>{children}</p>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16 px-4 text-center rounded-xl border" style={{ borderColor: 'var(--border-light)', backgroundColor: 'var(--bg-surface)' }}>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{message}</p>
    </div>
  );
}
