/**
 * QR codes drawn with plain views (no SVG or image module): each row of the
 * code becomes runs of dark and light squares. qrcode-generator does the
 * encoding.
 */
import qrcode from 'qrcode-generator';

/** The school's website, which the Share tab's QR code opens. */
export const SCHOOL_WEBSITE = 'https://www.khroyals.com';

export type Run = { dark: boolean; length: number };
export type QrRows = { size: number; rows: Run[][] };

/** Encode text (medium error correction, so a scratched or glared screen still scans) as rows of runs. */
export function qrRows(text: string): QrRows {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const rows: Run[][] = [];
  for (let r = 0; r < size; r++) {
    const runs: Run[] = [];
    for (let c = 0; c < size; c++) {
      const dark = qr.isDark(r, c);
      const last = runs[runs.length - 1];
      if (last && last.dark === dark) last.length++;
      else runs.push({ dark, length: 1 });
    }
    rows.push(runs);
  }
  return { size, rows };
}
