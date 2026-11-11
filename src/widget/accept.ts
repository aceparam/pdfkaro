// Whether a file is of a type a tool accepts, from its first bytes. It runs on
// the page before any engine loads, so a wrong file is turned away at once.

/** How many bytes from the start of a file the check reads. */
export const sniffLength = 1024;

const pdfMark = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function startsWith(bytes: Uint8Array, mark: number[]): boolean {
  return mark.every((byte, index) => bytes[index] === byte);
}

function contains(bytes: Uint8Array, mark: number[], within: number): boolean {
  const end = Math.min(bytes.length, within) - mark.length;
  for (let start = 0; start <= end; start++) {
    if (mark.every((byte, index) => bytes[start + index] === byte)) return true;
  }
  return false;
}

// The first bytes of each type the site knows. A PDF reader allows junk before
// "%PDF-", so a PDF is looked for anywhere in the first 1024 bytes.
const checks: Record<string, (bytes: Uint8Array) => boolean> = {
  'application/pdf': (bytes) => contains(bytes, pdfMark, sniffLength),
  'image/jpeg': (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  'image/png': (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
};

/**
 * True when the first bytes of a file match one of the types the tool accepts.
 * A type the site has no check for is accepted, and its engine decides.
 */
export function looksAccepted(firstBytes: Uint8Array, accepts: string[]): boolean {
  return accepts.some((type) => {
    const check = checks[type];
    return check ? check(firstBytes) : true;
  });
}
