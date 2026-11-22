const encoder = new TextEncoder();
const ascii = value => encoder.encode(String(value));

function concatBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function objectBytes(index, bodyParts) {
  return concatBytes([ascii(`${index} 0 obj\n`), ...bodyParts, ascii('\nendobj\n')]);
}

export function buildSinglePageJpegPdf({ jpegBytes, pixelWidth, pixelHeight, widthMm, heightMm, title = 'INK Artwork' }) {
  const image = jpegBytes instanceof Uint8Array ? jpegBytes : new Uint8Array(jpegBytes || []);
  if (!image.length) throw new Error('PDF 需要有效 JPEG 資料');
  const width = Math.max(1, Math.round(Number(pixelWidth) || 1));
  const height = Math.max(1, Math.round(Number(pixelHeight) || 1));
  const widthPt = Number(widthMm) * 72 / 25.4;
  const heightPt = Number(heightMm) * 72 / 25.4;
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt <= 0 || heightPt <= 0) throw new Error('PDF 實體尺寸無效');
  const safeTitle = String(title || 'INK Artwork').replace(/[()\\]/g, value => `\\${value}`);
  const content = `q\n${widthPt.toFixed(4)} 0 0 ${heightPt.toFixed(4)} 0 0 cm\n/Im0 Do\nQ`;
  const objects = [
    objectBytes(1, [ascii('<< /Type /Catalog /Pages 2 0 R >>')]),
    objectBytes(2, [ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')]),
    objectBytes(3, [ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(4)} ${heightPt.toFixed(4)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)]),
    objectBytes(4, [ascii(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, ascii('\nendstream')]),
    objectBytes(5, [ascii(`<< /Length ${ascii(content).length} >>\nstream\n${content}\nendstream`)]),
    objectBytes(6, [ascii(`<< /Title (${safeTitle}) /Producer (INK) >>`)])
  ];
  const header = concatBytes([ascii('%PDF-1.4\n%'), new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]), ascii('\n')]);
  const offsets = [0];
  let cursor = header.length;
  for (const object of objects) {
    offsets.push(cursor);
    cursor += object.length;
  }
  const xrefOffset = cursor;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (let index = 1; index <= objects.length; index++) xref.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return concatBytes([header, ...objects, ascii(xref.join('')), ascii(trailer)]);
}

export async function canvasToJpegBytes(canvas, quality = 0.96) {
  const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('JPEG 建立失敗')), 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}

export async function canvasToPdfBlob(canvas, { widthMm, heightMm, title = 'INK Artwork', quality = 0.96 } = {}) {
  const jpegBytes = await canvasToJpegBytes(canvas, quality);
  const bytes = buildSinglePageJpegPdf({ jpegBytes, pixelWidth: canvas.width, pixelHeight: canvas.height, widthMm, heightMm, title });
  return new Blob([bytes], { type: 'application/pdf' });
}
