// Files made in the tests of Remove a password (Unlock PDF), shared by its unit and end-to-end tests.

/** A one-page PDF written by hand, with each object's body as given and the trailer's extra keys. */
function rawPdf(objects: string[], trailerExtra: string): Uint8Array {
  let out = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra} >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/**
 * A PDF whose encryption dictionary names a certificate filter (`/Filter /Adobe.PubSec`), which qpdf cannot open:
 * it says "unsupported encryption filter". The recipients are a stand-in, as no certificate is needed to be refused.
 */
export function certificatePdf(): Uint8Array {
  return rawPdf(
    [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
      '<< /Filter /Adobe.PubSec /SubFilter /adbe.pkcs7.s5 /V 4 /R 4 /Length 128 /Recipients [<3082>] /CF << /DefaultCryptFilter << /CFM /AESV2 /Recipients [<3082>] >> >> /StmF /DefaultCryptFilter /StrF /DefaultCryptFilter >>',
    ],
    '/Encrypt 4 0 R /ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>]',
  );
}
