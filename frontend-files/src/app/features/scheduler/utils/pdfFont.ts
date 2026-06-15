/**
 * Registers a Turkish-capable Unicode font (DejaVu Sans) into a jsPDF document.
 * jsPDF's built-in fonts (WinAnsi) cannot render İ/ş/ğ/ı, so we fetch a TTF at
 * runtime, base64-encode it and register both the regular and bold variants.
 * The encoded fonts are cached at module scope so the fetch happens only once.
 */
import type jsPDF from 'jspdf';

const REGULAR_URL = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf';
const BOLD_URL = 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans-Bold.ttf';

let cache: { regular: string; bold: string } | null = null;

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Loads + registers the font, returning the jsPDF font family name to use. */
export async function registerTurkishFont(doc: jsPDF): Promise<string> {
  if (!cache) {
    const [regular, bold] = await Promise.all([
      fetchAsBase64(REGULAR_URL),
      fetchAsBase64(BOLD_URL),
    ]);
    cache = { regular, bold };
  }
  doc.addFileToVFS('DejaVuSans.ttf', cache.regular);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', cache.bold);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  return 'DejaVu';
}
