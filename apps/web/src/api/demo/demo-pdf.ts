/** Tiny, clearly watermarked sample document; never represents an awarded qualification. */
export function demoCertificatePdf(serial: string, name: string): Uint8Array {
  const escapePdfText = (text: string) =>
    text.replace(/[^\x20-\x7E]/g, '').replace(/[\\()]/g, '\\$&');
  const lines = [
    'ACADEMYOPS - PORTFOLIO DEMO',
    'FICTIONAL SAMPLE - NOT A QUALIFICATION',
    `Sample learner: ${name.replace(/[^\x20-\x7E]/g, '').slice(0, 60) || 'Demo learner'}`,
    `Reference: ${serial}`,
    'No certificate has been issued by a real institution.',
  ];
  const content = `BT /F1 16 Tf 55 760 Td ${lines.map((line, index) => `${index ? '0 -42 Td ' : ''}(${escapePdfText(line)}) Tj`).join('\n')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}
