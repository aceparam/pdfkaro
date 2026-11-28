// Repair PDF's linear pre-pass: rewrites a damaged PDF so that pdf-lib's reader,
// which Repair PDF uses on files qpdf cannot read (the owner's decision of
// 28 Nov 2026, "pdf-lib + pre-pass"), never needs its slow paths. One forward
// pass with a bounded look-ahead, so its time grows in proportion to the file;
// it decodes nothing. Its own source file so its tests stand alone; only Repair
// PDF imports it, so the build inlines it into that engine's file.
//
// What it does (add-repair-pdf, design decision 3):
// - finds `<int> <int> obj` at token boundaries, and closes an object left
//   open, with no `endobj`, before the next header or the end of the file;
// - follows literal strings (nesting and backslash escapes, as pdf-lib reads
//   them) and hex strings inside an object, and closes one still open when the
//   next header comes or the file ends;
// - outside strings and stream bodies, makes a run of whitespace or comments
//   over 4 KiB one space, and cuts a run of digits over 32 to 32;
// - trusts a stream's direct `/Length` when whitespace and `endstream` follow
//   it (pdf-lib reads such a stream the same way); otherwise the body runs to
//   the first `endstream` before the next header, or to that header or the end
//   of the file, and a correct direct `/Length` is written into the stream's
//   dictionary before its `>>`, so pdf-lib never searches for the stream's end;
// - between objects keeps only `trailer` dictionaries, dropping old tables,
//   `startxref` values and other bytes;
// - writes `%PDF-1.7` in front when no `%PDF-` is in the first 1,024 bytes;
// - says whether any name `/Encrypt` was seen outside strings and stream bodies;
// - gives the input itself when nothing would change but dropping well-formed
//   tables, `startxref` values, comments and short whitespace between objects
//   (pdf-lib reads those in linear time), so a large file is not copied.
// Every byte of a new copy is counted against the caller's budget first.

/**
 * A rewritten file: its bytes (the input itself when `changed` is false), whether `/Encrypt` was seen, and where each
 * object it holds starts and ends in those bytes (`ends`: the offset of an object's first digit, to the offset just
 * after its `endobj`), so a reader that cannot parse an object can skip exactly that object.
 */
export type Rebuilt = { bytes: Uint8Array; encrypt: boolean; changed: boolean; ends: Map<number, number> };

/** A run of whitespace or comments longer than this becomes one space. */
export const longestRun = 4096;
/** A run of digits longer than this is cut to it: no valid PDF number is this long. */
export const longestDigits = 32;
/** How far into the file `%PDF-` may start. */
export const headerReach = 1024;

const ws = new Uint8Array(256);
for (const code of [0, 9, 10, 12, 13, 32]) ws[code] = 1;
const delimiter = new Uint8Array(256);
for (const char of '()<>[]{}/%') delimiter[char.charCodeAt(0)] = 1;
const isDigit = (byte: number) => byte >= 0x30 && byte <= 0x39;
const isRegular = (byte: number) => ws[byte] === 0 && delimiter[byte] === 0;

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));
const keyword = {
  obj: ascii('obj'),
  endobj: ascii('endobj'),
  stream: ascii('stream'),
  endstream: ascii('endstream'),
  trailer: ascii('trailer'),
  header: ascii('%PDF-'),
  length: ascii('/Length'),
  encrypt: ascii('/Encrypt'),
};
// The ways pdf-lib matches the word that starts a stream's data, in its order (PDFObjectParser.parseDictOrStream).
const streamStarts = [ascii('stream \r\n'), ascii('stream\r\n'), ascii('stream\r'), ascii('stream\n'), ascii('stream')];
const benignWords = [ascii('xref'), ascii('startxref'), ascii('n'), ascii('f')];

function matchesAt(data: Uint8Array, at: number, word: Uint8Array): boolean {
  if (at < 0 || at + word.length > data.length) return false;
  for (let index = 0; index < word.length; index++) if (data[at + index] !== word[index]) return false;
  return true;
}

function sameBytes(data: Uint8Array, start: number, end: number, word: Uint8Array): boolean {
  return end - start === word.length && matchesAt(data, start, word);
}

/**
 * Watches bytes one at a time, inside strings and stream bodies, for an object header: two runs of at most 32 digits
 * and `obj`, separated by whitespace, starting at a token boundary and ending at one. O(1) a byte.
 */
class HeaderWatch {
  private state = 0;
  private previousRegular = false;
  private first = 0;
  private firstDigits = 0;
  private second = 0;
  private secondDigits = 0;

  constructor(previousRegular: boolean) {
    this.previousRegular = previousRegular;
  }

  /** Feeds the byte at `at`; gives where a header starts when this byte ends one, else -1. */
  feed(byte: number, at: number): number {
    const regular = isRegular(byte);
    const digit = isDigit(byte);
    let found = -1;
    switch (this.state) {
      case 1:
        if (digit) {
          if (++this.firstDigits > longestDigits) this.state = 0;
          this.previousRegular = true;
          return -1;
        }
        this.state = ws[byte] ? 2 : 0;
        break;
      case 2:
        if (ws[byte]) {
          this.previousRegular = false;
          return -1;
        }
        if (digit) {
          this.state = 3;
          this.second = at;
          this.secondDigits = 1;
          this.previousRegular = true;
          return -1;
        }
        this.state = 0;
        break;
      case 3:
        if (digit) {
          if (++this.secondDigits > longestDigits) this.state = 0;
          this.previousRegular = true;
          return -1;
        }
        this.state = ws[byte] ? 4 : 0;
        break;
      case 4:
        if (ws[byte]) {
          this.previousRegular = false;
          return -1;
        }
        if (byte === 0x6f) {
          this.state = 5;
          this.previousRegular = true;
          return -1;
        }
        if (digit) {
          // "1 2 3 obj": the second run becomes the first.
          this.first = this.second;
          this.firstDigits = this.secondDigits;
          this.second = at;
          this.secondDigits = 1;
          this.state = 3;
          this.previousRegular = true;
          return -1;
        }
        this.state = 0;
        break;
      case 5:
        if (byte === 0x62) {
          this.state = 6;
          this.previousRegular = true;
          return -1;
        }
        this.state = 0;
        break;
      case 6:
        if (byte === 0x6a) {
          this.state = 7;
          this.previousRegular = true;
          return -1;
        }
        this.state = 0;
        break;
      case 7:
        if (!regular) found = this.first;
        this.state = 0;
        break;
      default:
        break;
    }
    if (this.state === 0 && digit && !this.previousRegular) {
      this.state = 1;
      this.first = at;
      this.firstDigits = 1;
    }
    this.previousRegular = regular;
    return found;
  }

  /** At the end of the data: where a header starts when the data ended right after its `obj`, else -1. */
  end(): number {
    return this.state === 7 ? this.first : -1;
  }
}

/** One change inside an object or trailer: the bytes from `at` to `to` replaced by `text`. */
type Edit = { at: number; to: number; text: string };

/** The kinds of token kept in a window, to find `<int> <int> obj` among tokens. */
type TokenKind = 'digits' | 'space' | 'other';

/** The last four tokens, oldest first. */
class TokenWindow {
  private kinds: TokenKind[] = [];
  private starts: number[] = [];
  push(kind: TokenKind, start: number) {
    // Whitespace next to whitespace (a comment between) is one gap.
    if (kind === 'space' && this.kinds[this.kinds.length - 1] === 'space') return;
    this.kinds.push(kind);
    this.starts.push(start);
    if (this.kinds.length > 4) {
      this.kinds.shift();
      this.starts.shift();
    }
  }
  clear() {
    this.kinds = [];
    this.starts = [];
  }
  /** Where a header starts, when the four tokens before an `obj` are digits, space, digits, space; else -1. */
  headerStart(): number {
    const [a, b, c, d] = this.kinds;
    return this.kinds.length === 4 && a === 'digits' && b === 'space' && c === 'digits' && d === 'space' ? this.starts[0]! : -1;
  }
}

/** The new file, built from spans of the input and short inserted texts, joined once at the end. */
class Builder {
  private parts: Uint8Array[] = [];
  size = 0;
  constructor(private readonly input: Uint8Array) {}
  span(start: number, end: number) {
    if (end <= start) return;
    this.parts.push(this.input.subarray(start, end));
    this.size += end - start;
  }
  text(text: string) {
    if (text.length === 0) return;
    const bytes = ascii(text);
    this.parts.push(bytes);
    this.size += bytes.length;
  }
  /** Writes `[start, end)` with the edits, which lie inside it, in order of where they start. */
  withEdits(start: number, end: number, edits: Edit[]) {
    edits.sort((a, b) => a.at - b.at);
    let at = start;
    for (const edit of edits) {
      this.span(at, Math.min(edit.at, end));
      this.text(edit.text);
      at = Math.max(at, edit.to);
    }
    this.span(at, end);
  }
  join(spend: (bytes: number) => void): Uint8Array {
    spend(this.size);
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/** How an object or trailer's scan ended: at `end`, having written `close` there; `header` when a header came first. */
type BodyEnd = { end: number; close: string; header: boolean };

/**
 * Rewrites `input` as design decision 3 of add-repair-pdf says, in one forward pass. `spend` is called with the size
 * of a new copy before it is made, and throws the caller's error past its budget.
 */
export function rebuild(input: Uint8Array, spend: (bytes: number) => void = () => {}): Rebuilt {
  if (!(input instanceof Uint8Array)) throw new Error('The pre-pass was given something other than bytes.');
  const n = input.length;
  const out = new Builder(input);
  let changed = false;
  let encrypt = false;
  // Where each object starts and ends, in the input and in the new copy.
  const inputEnds = new Map<number, number>();
  const outputEnds = new Map<number, number>();

  // The header: `%PDF-` and its version, as pdf-lib finds it; else `%PDF-1.7` in front.
  let at = -1;
  for (let index = 0; index <= Math.min(n - keyword.header.length, headerReach - 1); index++) {
    if (matchesAt(input, index, keyword.header)) {
      at = index;
      break;
    }
  }
  let i: number;
  if (at < 0) {
    out.text('%PDF-1.7\n');
    changed = true;
    i = 0;
  } else {
    let end = at + keyword.header.length;
    while (end < n && end - at < 16 && (isDigit(input[end]!) || input[end] === 0x2e)) end++;
    out.span(at, end);
    out.text('\n');
    i = end;
  }

  /** Skips whitespace and comments from `from`; gives where they end. */
  const skipSpace = (from: number) => {
    let q = from;
    while (q < n) {
      const byte = input[q]!;
      if (ws[byte]) q++;
      else if (byte === 0x25) {
        while (q < n && input[q] !== 0x0a && input[q] !== 0x0d) q++;
      } else break;
    }
    return q;
  };

  /**
   * Scans an object's body from `from` (just after its `obj`), or a trailer's dictionary from `from` (its `<<`), to
   * its end, collecting edits. Gives where it ends and what to write there.
   */
  const scanBody = (from: number, edits: Edit[], trailer: boolean): BodyEnd => {
    const window = new TokenWindow();
    let depth = 0;
    let afterDictClose = false;
    let dictClose = -1;
    // The outermost dictionary's direct /Length: 0 none, 1 after the key, 2 a number, 3 a second number, 4 decided.
    let lengthState = 0;
    let lengthValue: number | undefined;
    let lengthPending: number | undefined;
    let q = from;
    // What closes the body where it stops early: the given text, then `endobj`, or a trailer's open dictionaries.
    const closer = (text: string) => `${text}${trailer ? '>>'.repeat(depth) : '\nendobj'}\n`;
    const finishLength = () => {
      if (lengthState === 2) lengthValue = lengthPending;
      else if (lengthState === 3) lengthValue = lengthPending;
      lengthState = 0;
    };
    while (q < n) {
      const byte = input[q]!;
      if (ws[byte] || byte === 0x25) {
        const start = q;
        q = skipSpace(q);
        if (q - start > longestRun) {
          edits.push({ at: start, to: q, text: ' ' });
          changed = true;
        }
        window.push('space', start);
        continue;
      }
      if (byte === 0x28) {
        // A literal string, by pdf-lib's rules: unescaped parentheses nest, a backslash escapes the next byte.
        finishLength();
        afterDictClose = false;
        window.push('other', q);
        const watch = new HeaderWatch(false);
        let nesting = 0;
        let escaped = false;
        let r = q;
        let done = false;
        for (; r < n; r++) {
          const c = input[r]!;
          const header = watch.feed(c, r);
          if (header >= 0) return { end: header, close: closer(')'.repeat(nesting)), header: true };
          if (!escaped) {
            if (c === 0x28) nesting++;
            else if (c === 0x29) nesting--;
          }
          if (c === 0x5c) escaped = !escaped;
          else escaped = false;
          if (nesting === 0) {
            done = true;
            r++;
            break;
          }
        }
        if (!done) {
          const header = watch.end();
          if (header >= 0) return { end: header, close: closer(')'.repeat(nesting)), header: true };
          return { end: n, close: closer(`${escaped ? ' ' : ''}${')'.repeat(nesting)}`), header: false };
        }
        q = r;
        continue;
      }
      if (byte === 0x3c && input[q + 1] === 0x3c) {
        finishLength();
        afterDictClose = false;
        depth++;
        window.push('other', q);
        q += 2;
        continue;
      }
      if (byte === 0x3c) {
        // A hex string, read to its `>` as pdf-lib reads it.
        finishLength();
        afterDictClose = false;
        window.push('other', q);
        const watch = new HeaderWatch(false);
        let r = q + 1;
        for (; r < n && input[r] !== 0x3e; r++) {
          const header = watch.feed(input[r]!, r);
          if (header >= 0) return { end: header, close: closer('>'), header: true };
        }
        if (r >= n) {
          const header = watch.end();
          return { end: header >= 0 ? header : n, close: closer('>'), header: header >= 0 };
        }
        q = r + 1;
        continue;
      }
      if (byte === 0x3e && input[q + 1] === 0x3e) {
        finishLength();
        window.push('other', q);
        if (depth > 0) depth--;
        q += 2;
        if (depth === 0) {
          if (trailer) return { end: q, close: '\n', header: false };
          afterDictClose = true;
          dictClose = q - 2;
        } else afterDictClose = false;
        continue;
      }
      if (byte === 0x2f) {
        // A name.
        finishLength();
        afterDictClose = false;
        const start = q;
        q++;
        while (q < n && isRegular(input[q]!)) q++;
        window.push('other', start);
        if (sameBytes(input, start, q, keyword.encrypt)) encrypt = true;
        if (depth === 1 && sameBytes(input, start, q, keyword.length)) {
          lengthState = 1;
          lengthValue = undefined;
        }
        continue;
      }
      if (delimiter[byte]) {
        finishLength();
        afterDictClose = false;
        window.push('other', q);
        q++;
        continue;
      }
      // A regular token.
      const start = q;
      if (afterDictClose && !trailer && matchesAt(input, start, keyword.stream)) {
        const ended = scanStream(start, dictClose, lengthValue, edits);
        afterDictClose = false;
        lengthValue = undefined;
        // A stream that ran into a header or the end of the file ends the object there.
        if (ended.header || ended.close !== '') return ended;
        window.clear();
        q = ended.end;
        continue;
      }
      afterDictClose = false;
      let digitsOnly = true;
      let run = 0;
      while (q < n && isRegular(input[q]!)) {
        if (isDigit(input[q]!)) {
          run++;
          // A run of digits over 32 is cut to 32.
          if (run === longestDigits + 1) {
            let end = q;
            while (end < n && isDigit(input[end]!)) end++;
            edits.push({ at: q, to: end, text: '' });
            changed = true;
            q = end;
            run = 0;
            continue;
          }
        } else {
          run = 0;
          digitsOnly = false;
        }
        q++;
      }
      if (digitsOnly) {
        // The outermost dictionary's /Length: a number, then maybe a second number and R (indirect).
        if (lengthState === 1) {
          lengthState = 2;
          lengthPending = Number(new TextDecoder().decode(input.subarray(start, Math.min(q, start + longestDigits))));
        } else if (lengthState === 2) lengthState = 3;
        else finishLength();
        window.push('digits', start);
        continue;
      }
      if (lengthState === 3 && sameBytes(input, start, q, ascii('R'))) {
        lengthState = 0;
        lengthValue = undefined;
      } else finishLength();
      if (sameBytes(input, start, q, keyword.obj)) {
        const header = window.headerStart();
        if (header >= 0) return { end: header, close: closer(''), header: true };
      }
      // `endobj`, also glued to what follows it ("endobj2 0 obj"), as pdf-lib matches it.
      if (!trailer && matchesAt(input, start, keyword.endobj)) return { end: start + keyword.endobj.length, close: '\n', header: false };
      window.push('other', start);
    }
    return { end: n, close: closer(''), header: false };
  };

  /**
   * A stream whose `stream` word starts at `start`, after a dictionary that closed with the `>>` at `dictClose`.
   * Gives where the stream ends (after its `endstream`), or the header it ran into.
   */
  const scanStream = (start: number, dictClose: number, length: number | undefined, edits: Edit[]): BodyEnd => {
    const word = streamStarts.find((each) => matchesAt(input, start, each))!;
    const dataStart = start + word.length;
    // A direct /Length followed by whitespace and `endstream` is trusted, as pdf-lib reads it.
    if (length !== undefined && Number.isSafeInteger(length) && length >= 0 && dataStart + length <= n) {
      const after = skipSpace(dataStart + length);
      if (matchesAt(input, after, keyword.endstream)) return { end: after + keyword.endstream.length, close: '', header: false };
    }
    const watch = new HeaderWatch(false);
    for (let r = dataStart; r < n; r++) {
      const byte = input[r]!;
      if (byte === 0x65 && matchesAt(input, r, keyword.endstream)) {
        let end = r;
        if (input[end - 1] === 0x0a) end--;
        if (input[end - 1] === 0x0d) end--;
        if (end < dataStart) end = dataStart;
        edits.push({ at: dictClose, to: dictClose, text: ` /Length ${end - dataStart} ` });
        changed = true;
        return { end: r + keyword.endstream.length, close: '', header: false };
      }
      const header = watch.feed(byte, r);
      if (header >= 0) {
        edits.push({ at: dictClose, to: dictClose, text: ` /Length ${header - dataStart} ` });
        changed = true;
        return { end: header, close: '\nendstream\nendobj\n', header: true };
      }
    }
    const header = watch.end();
    const end = header >= 0 ? header : n;
    edits.push({ at: dictClose, to: dictClose, text: ` /Length ${end - dataStart} ` });
    changed = true;
    return { end, close: '\nendstream\nendobj\n', header: header >= 0 };
  };

  // Between objects: find headers and trailers among tokens; drop the rest.
  const window = new TokenWindow();
  let gapBenign = true;
  while (i < n) {
    const byte = input[i]!;
    if (ws[byte] || byte === 0x25) {
      const start = i;
      i = skipSpace(i);
      if (i - start > longestRun) gapBenign = false;
      window.push('space', start);
      continue;
    }
    if (!isRegular(byte)) {
      gapBenign = false;
      window.push('other', i);
      i++;
      continue;
    }
    const start = i;
    while (i < n && isRegular(input[i]!)) i++;
    let digitsOnly = true;
    for (let index = start; index < i; index++) {
      if (!isDigit(input[index]!)) {
        digitsOnly = false;
        break;
      }
    }
    if (digitsOnly) {
      if (i - start > longestDigits) gapBenign = false;
      window.push('digits', start);
      continue;
    }
    if (sameBytes(input, start, i, keyword.obj) && window.headerStart() >= 0) {
      const objectStart = window.headerStart();
      if (!gapBenign) changed = true;
      const edits: Edit[] = [];
      const ended = scanBody(i, edits, false);
      if (ended.close !== '\n') changed = true;
      const written = out.size;
      out.withEdits(objectStart, ended.end, edits);
      out.text(ended.close);
      inputEnds.set(objectStart, ended.end);
      outputEnds.set(written, out.size);
      i = ended.end;
      window.clear();
      gapBenign = true;
      continue;
    }
    if (sameBytes(input, start, i, keyword.trailer)) {
      const dict = skipSpace(i);
      if (input[dict] === 0x3c && input[dict + 1] === 0x3c) {
        const edits: Edit[] = [];
        const ended = scanBody(dict, edits, true);
        if (ended.header || ended.close !== '\n') changed = true;
        out.text('trailer\n');
        out.withEdits(dict, ended.end, edits);
        out.text(ended.close);
        i = ended.end;
        window.clear();
        continue;
      }
      gapBenign = false;
      window.push('other', start);
      continue;
    }
    if (!benignWords.some((word) => sameBytes(input, start, i, word))) gapBenign = false;
    window.push('other', start);
  }
  if (!gapBenign) changed = true;
  return changed ? { bytes: out.join(spend), encrypt, changed, ends: outputEnds } : { bytes: input, encrypt, changed, ends: inputEnds };
}
