// Repair PDF's linear pre-pass (src/engines/rebuild.ts, add-repair-pdf design decision 3): what it keeps, closes and
// rewrites, and that it takes time in proportion to the file on the hostile inputs of the threats table. It decodes
// nothing and makes no request: `fetch` is replaced by one that throws and records.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { longestDigits, longestRun, rebuild } from '../../src/engines/rebuild';
import { bytesOf, damagedKinds, fixture, handPdf, hostile, latin1, streamBody } from './repair-helpers';

const fetched: unknown[] = [];
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = ((...args: unknown[]) => {
    fetched.push(args[0]);
    throw new Error('No request may be made by the pre-pass.');
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
  expect(fetched).toEqual([]);
});

const text = (pdf: string) => latin1(rebuild(bytesOf(pdf)).bytes);
const M = 1024 * 1024;

describe('what the pre-pass keeps and drops', () => {
  it('returns the input itself for a sound file: tables, startxref, comments and junk before the header are benign', () => {
    const junked = bytesOf(`some junk\n${latin1(fixture('text.pdf'))}`);
    expect(rebuild(junked).bytes).toBe(junked);
    for (const name of ['text.pdf', 'rich.pdf', 'pages-500.pdf', 'form.pdf']) {
      const input = fixture(name);
      const rebuilt = rebuild(input);
      expect(rebuilt.changed, name).toBe(false);
      expect(rebuilt.bytes, name).toBe(input);
    }
  });

  it('records where each object starts and ends, in the bytes it gives', () => {
    const pdf = handPdf(['<< /Type /Catalog >>', '(a string)']);
    const unchanged = rebuild(bytesOf(pdf));
    expect([...unchanged.ends]).toEqual([
      [pdf.indexOf('1 0 obj'), pdf.indexOf('endobj') + 6],
      [pdf.indexOf('2 0 obj'), pdf.indexOf('endobj', pdf.indexOf('2 0 obj')) + 6],
    ]);
    const changed = rebuild(bytesOf(pdf.replace('2 0 obj', 'GARBAGE\n2 0 obj')));
    expect(changed.changed).toBe(true);
    const out = latin1(changed.bytes);
    for (const [start, end] of changed.ends) {
      expect(out.slice(start)).toMatch(/^\d+ 0 obj/);
      expect(out.slice(0, end)).toMatch(/endobj\n?$/);
    }
  });

  it('keeps objects and trailers, and drops old tables, startxref values and other bytes between them', () => {
    const out = text(`%PDF-1.4\nGARBAGE\n1 0 obj\n<< /A 1 >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n99\n%%EOF\n`);
    expect(out).toBe('%PDF-1.4\n1 0 obj\n<< /A 1 >>\nendobj\ntrailer\n<< /Size 2 /Root 1 0 R >>\n');
  });

  it('adds %PDF-1.7 in front when no %PDF- is in the first 1,024 bytes', () => {
    expect(text('1 0 obj\n<< >>\nendobj\n')).toBe('%PDF-1.7\n1 0 obj\n<< >>\nendobj\n');
    expect(text(`${' '.repeat(1100)}%PDF-1.4\n1 0 obj\n<< >>\nendobj\n`).startsWith('%PDF-1.7\n')).toBe(true);
  });

  it('closes an object left open before the next header and at the end', () => {
    expect(text('%PDF-1.7\n1 0 obj\n<< /A 1 >>\n2 0 obj\n<< /B 2 >>')).toBe('%PDF-1.7\n1 0 obj\n<< /A 1 >>\n\nendobj\n2 0 obj\n<< /B 2 >>\nendobj\n');
  });

  it('finds an `endobj` glued to what follows, as pdf-lib does', () => {
    expect(text('%PDF-1.7\n1 0 obj (a) endobj2 0 obj (b) endobj junk')).toBe('%PDF-1.7\n1 0 obj (a) endobj\n2 0 obj (b) endobj\n');
  });

  it('follows literal strings with nesting and escapes, and hex strings, holding obj, endobj, stream and parentheses', () => {
    const body = '<< /A (one (two) \\) endobj stream 3 0 R) /B <414243> /C (\\\\) >>';
    expect(text(`%PDF-1.7\n1 0 obj\n${body}\nendobj\n`)).toBe(`%PDF-1.7\n1 0 obj\n${body}\nendobj\n`);
  });

  it('closes a literal or hex string still open at a header, and at the end of the file', () => {
    expect(text('%PDF-1.7\n1 0 obj\n(open ((\n2 0 obj\n(b)\nendobj\n')).toBe('%PDF-1.7\n1 0 obj\n(open ((\n)))\nendobj\n2 0 obj\n(b)\nendobj\n');
    expect(text('%PDF-1.7\n1 0 obj\n<4142\n2 0 obj\n(b)\nendobj\n')).toBe('%PDF-1.7\n1 0 obj\n<4142\n>\nendobj\n2 0 obj\n(b)\nendobj\n');
    expect(text('%PDF-1.7\n1 0 obj\n(open \\')).toBe('%PDF-1.7\n1 0 obj\n(open \\ )\nendobj\n');
  });

  it('treats names with # escapes as names', () => {
    const body = '<< /Na#20me (x) /Length#20 5 >>';
    expect(text(`%PDF-1.7\n1 0 obj\n${body}\nendobj\n`)).toBe(`%PDF-1.7\n1 0 obj\n${body}\nendobj\n`);
  });

  it('keeps a trailer whole, and closes one left open', () => {
    expect(text('%PDF-1.7\ntrailer\n<< /Root 1 0 R /ID [<00> <01>] /X << /Y (s) >> >>\n')).toBe('%PDF-1.7\ntrailer\n<< /Root 1 0 R /ID [<00> <01>] /X << /Y (s) >> >>\n');
    expect(text('%PDF-1.7\ntrailer\n<< /Root 1 0 R /X << /Y 1')).toBe('%PDF-1.7\ntrailer\n<< /Root 1 0 R /X << /Y 1>>>>\n');
  });

  it('says whether /Encrypt was seen outside strings and stream bodies', () => {
    expect(rebuild(bytesOf('%PDF-1.7\ntrailer\n<< /Encrypt 5 0 R >>\n')).encrypt).toBe(true);
    expect(rebuild(bytesOf('%PDF-1.7\n1 0 obj\n<< /Type /XRef /Encrypt 5 0 R >>\nendobj\n')).encrypt).toBe(true);
    expect(rebuild(bytesOf('%PDF-1.7\n1 0 obj\n(/Encrypt)\nendobj\n')).encrypt).toBe(false);
    expect(rebuild(bytesOf(`%PDF-1.7\n1 0 obj\n${streamBody('/Encrypt')}\nendobj\n`)).encrypt).toBe(false);
    expect(rebuild(fixture('password.pdf')).encrypt).toBe(true);
    expect(rebuild(fixture('text.pdf')).encrypt).toBe(false);
  });
});

describe('stream lengths', () => {
  it('trusts a direct /Length that whitespace and endstream follow', () => {
    const pdf = `%PDF-1.7\n1 0 obj\n${streamBody('abc endstream inside')}\nendobj\n`;
    expect(text(`${pdf}GARBAGE\n`)).toBe(pdf);
  });

  it('writes a correct direct /Length where it is missing, wrong or indirect', () => {
    for (const length of ['', '/Length 3', '/Length 999', '/Length 7 0 R']) {
      const out = text(`%PDF-1.7\n1 0 obj\n<< ${length} >>\nstream\nhello world\nendstream\nendobj\n`);
      expect(out, length).toBe(`%PDF-1.7\n1 0 obj\n<< ${length}  /Length 11 >>\nstream\nhello world\nendstream\nendobj\n`);
    }
  });

  it('takes the end before a CR LF ahead of endstream, as pdf-lib does', () => {
    const out = text('%PDF-1.7\r\n1 0 obj\r\n<< >>\r\nstream\r\nhello\r\nendstream\r\nendobj\r\n');
    expect(out).toContain('<<  /Length 5 >>');
  });

  it('closes a stream with no endstream before the next header, and at the end of the file', () => {
    expect(text('%PDF-1.7\n1 0 obj\n<< >>\nstream\nabc\n2 0 obj\n(b)\nendobj\n')).toBe('%PDF-1.7\n1 0 obj\n<<  /Length 4 >>\nstream\nabc\n\nendstream\nendobj\n2 0 obj\n(b)\nendobj\n');
    expect(text('%PDF-1.7\n1 0 obj\n<< >>\nstream\nabcdef')).toBe('%PDF-1.7\n1 0 obj\n<<  /Length 6 >>\nstream\nabcdef\nendstream\nendobj\n');
  });

  it('reads the start of stream data as pdf-lib matches the word stream and its line end', () => {
    expect(text('%PDF-1.7\n1 0 obj\n<< >> stream \r\nab\nendstream endobj\n')).toContain('<<  /Length 2 >> stream \r\nab');
    expect(text('%PDF-1.7\n1 0 obj\n<< >> stream\rab\nendstream endobj\n')).toContain('<<  /Length 2 >> stream\rab');
  });
});

describe('runs', () => {
  it('makes a run of whitespace or comments over 4 KiB one space, and keeps a shorter one', () => {
    const long = `${' '.repeat(longestRun)}%c\n`;
    expect(text(`%PDF-1.7\n1 0 obj\n<< /A${long}1 >>\nendobj\n`)).toBe('%PDF-1.7\n1 0 obj\n<< /A 1 >>\nendobj\n');
    const short = ' '.repeat(longestRun - 10);
    expect(text(`junk\n%PDF-1.7\n1 0 obj\n<< /A${short}1 >>\nendobj\n`)).toContain(`/A${short}1`);
  });

  it('cuts a run of digits over 32 to 32', () => {
    const digits = '1'.repeat(longestDigits + 50);
    expect(text(`%PDF-1.7\n1 0 obj\n[${digits} 2]\nendobj\n`)).toBe(`%PDF-1.7\n1 0 obj\n[${'1'.repeat(longestDigits)} 2]\nendobj\n`);
  });
});

describe('the damaged kinds', () => {
  it('gives every one of the 36 kinds a file that starts with %PDF- and holds the source objects', async () => {
    for (const kind of await damagedKinds()) {
      const out = latin1(rebuild(kind.bytes).bytes);
      expect(out.slice(0, 1024).includes('%PDF-'), kind.name).toBe(true);
      expect(/\b1 0 obj/.test(out) || kind.source === 'pages-500' || kind.source === 'damaged-cut', kind.name).toBe(true);
    }
  });
});

describe('time in proportion to the file', () => {
  // Each hostile input of the threats table at 1 MB and 4 MB: the larger takes at most about four times as long, with
  // slack for timer noise, and each finishes well within a fixed time.
  const cases: [string, (size: number) => Uint8Array][] = [
    ['unclosed objects', hostile.unclosedObjects],
    ['unclosed streams', hostile.unclosedStreams],
    ['unclosed literal strings', hostile.unclosedLiteral],
    ['unclosed hex strings', hostile.unclosedHex],
    ['one long unclosed literal string', hostile.longLiteral],
    ['one long unclosed hex string', hostile.longHex],
    ['runs of junk and digits', hostile.junkRuns],
    ['extra stream words with missing, wrong and indirect /Length', hostile.streamWords],
    ['fake headers opening hex strings after endobj inside a string', hostile.pastPrepassHex],
    ['a space run after endobj inside a string', hostile.pastPrepassSpaces],
  ];
  for (const [name, make] of cases) {
    it(`reads ${name} in linear time`, () => {
      const small = make(M);
      const large = make(4 * M);
      rebuild(small);
      const timed = (input: Uint8Array) => {
        const started = performance.now();
        rebuild(input);
        return performance.now() - started;
      };
      const smallTime = Math.max(5, timed(small));
      const largeTime = timed(large);
      expect(largeTime).toBeLessThan(2000);
      expect(largeTime).toBeLessThan(smallTime * 8 + 50);
    });
  }

  it('counts the copy it makes against the budget before making it', () => {
    let asked = 0;
    const input = bytesOf('%PDF-1.7\n1 0 obj (a) endobj\nGARBAGE\n');
    const out = rebuild(input, (bytes) => (asked = bytes));
    expect(asked).toBe(out.bytes.length);
    class Over extends Error {}
    expect(() =>
      rebuild(input, () => {
        throw new Over();
      }),
    ).toThrow(Over);
  });
});
