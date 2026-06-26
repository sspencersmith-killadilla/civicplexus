import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

function hexToRgb(hex: string) {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const v = parseInt(n, 16);
  return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

export type BadgeInput = {
  org_name: string;
  accent_color: string;
  display_name: string;
  job_title: string;
  department: string;
  employee_code: string;
  serial: string;
  verify_url: string;
  show: { title: boolean; department: boolean; employee_id: boolean; qr: boolean };
  photo_png?: Uint8Array | null;
};

/** Renders a CR80 landscape badge (3.375" x 2.125") as a single-page PDF. */
export async function renderBadgePdf(input: BadgeInput): Promise<Uint8Array> {
  const W = 3.375 * 72;
  const H = 2.125 * 72;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([W, H]);
  const accent = hexToRgb(input.accent_color || "#0F3460");
  const ink = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.35, 0.35, 0.35);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);

  // Background
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  // Accent bar
  page.drawRectangle({ x: 0, y: H - 26, width: W, height: 26, color: accent });
  page.drawText(input.org_name.toUpperCase(), {
    x: 12, y: H - 18, size: 10, font: bold, color: rgb(1, 1, 1),
  });

  // Photo placeholder
  const photoX = 12, photoY = 18, photoW = 80, photoH = 100;
  page.drawRectangle({ x: photoX, y: photoY, width: photoW, height: photoH, color: rgb(0.93, 0.93, 0.93) });
  if (input.photo_png) {
    try {
      const img = await pdf.embedPng(input.photo_png);
      const scale = Math.max(photoW / img.width, photoH / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      page.drawImage(img, { x: photoX + (photoW - dw) / 2, y: photoY + (photoH - dh) / 2, width: dw, height: dh });
    } catch {
      try {
        const img = await pdf.embedJpg(input.photo_png);
        const scale = Math.max(photoW / img.width, photoH / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        page.drawImage(img, { x: photoX + (photoW - dw) / 2, y: photoY + (photoH - dh) / 2, width: dw, height: dh });
      } catch { /* ignore */ }
    }
  }

  // Text block
  const tx = photoX + photoW + 12;
  let ty = H - 50;
  page.drawText(input.display_name, { x: tx, y: ty, size: 13, font: bold, color: ink, maxWidth: W - tx - 12 });
  ty -= 18;
  if (input.show.title && input.job_title) {
    page.drawText(input.job_title, { x: tx, y: ty, size: 9, font: reg, color: ink, maxWidth: W - tx - 12 });
    ty -= 12;
  }
  if (input.show.department && input.department) {
    page.drawText(input.department, { x: tx, y: ty, size: 8, font: reg, color: muted, maxWidth: W - tx - 12 });
    ty -= 12;
  }
  if (input.show.employee_id && input.employee_code) {
    page.drawText(`ID ${input.employee_code}`, { x: tx, y: ty, size: 8, font: reg, color: muted });
    ty -= 12;
  }
  page.drawText(`SN ${input.serial}`, { x: tx, y: 8, size: 6, font: reg, color: muted });

  // QR
  if (input.show.qr) {
    const qrPng = await QRCode.toBuffer(input.verify_url, { type: "png", margin: 0, scale: 4 });
    const img = await pdf.embedPng(qrPng);
    const qs = 56;
    page.drawImage(img, { x: W - qs - 10, y: 14, width: qs, height: qs });
  }

  return await pdf.save();
}