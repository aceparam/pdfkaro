// Generated streams for the content reader (src/engines/content.ts): a seeded generator builds random valid
// token sequences (numbers, names with and without #xx, strings with escapes, hex strings, nested arrays and
// dictionaries, comments, every operator with operand runs of every length, and a few clear inline pictures), with
// and without spaces wherever tokens may touch. The operators and runs the reader reports must equal what the
// generator built. The seed is printed on failure; CONTENT_SEED runs one chosen seed. No request may be made.

import { describe, expect, it } from 'vitest';
import { editContent, kindBit, operandCounts, type OperandKind } from '../../src/engines/content';
import { latin1, noRequests, recordingEditor } from './content-helpers';

noRequests('the content reader');

/** mulberry32: a small seeded generator. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (below: number) => Math.floor(next() * below), pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]! };
}

type Built = { operator: string; operands: { kind: OperandKind; start: number; end: number }[] };
const operators = Object.keys(operandCounts).filter((name) => !['BI', 'ID', 'EI'].includes(name));
const spaces = [' ', '\n', '\r', '\r\n', '  '];

function generate(seed: number): { source: string; built: Built[] } {
  const rng = random(seed);
  let source = '';
  const built: Built[] = [];
  let run: Built['operands'] = [];
  let open = 0;

  /** Adds a token, with whitespace before it, or none where the grammar lets it touch the one before. */
  const put = (token: string, mustSpace = false) => {
    const last = source.at(-1);
    // Tokens may touch when the one before ends with ), >, ] or >>, or this one starts with /, (, <, [ or %.
    const mayTouch = last !== undefined && !mustSpace && (')>]'.includes(last) || '/(<[%'.includes(token[0]!));
    const spaced = last === undefined || /[ \n\r]$/.test(source);
    if (!spaced && (!mayTouch || rng.next() < 0.5)) source += rng.pick(spaces);
    else if (last !== undefined && rng.next() < 0.2) source += rng.pick(spaces);
    const start = source.length;
    source += token;
    return start;
  };

  const number = () => rng.pick([`${rng.int(1000)}`, `-${rng.int(100)}`, `+${rng.int(9)}`, `${rng.int(50)}.${rng.int(100)}`, `.${rng.int(99)}`, `${rng.int(9)}.`, `-.${rng.int(9)}`]);
  const nameText = () => {
    let name = '/';
    for (let index = rng.int(6); index >= 0; index--) name += rng.next() < 0.15 ? `#${rng.pick(['20', '2F', '41', 'e9', 'C3'])}` : rng.pick([...'abcXYZ019_.-*']);
    return name;
  };
  const stringText = (depth = 0): string => {
    let inner = '';
    for (let index = rng.int(8); index > 0; index--) {
      const choice = rng.int(10);
      if (choice === 0) inner += rng.pick(['\\(', '\\)', '\\\\', '\\n', '\\053', '\\\n']);
      else if (choice === 1 && depth < 3) inner += stringText(depth + 1);
      else inner += rng.pick([...'abc 123<>[]{}/%#~E']);
    }
    return `(${inner})`;
  };
  const hexText = () => `<${Array.from({ length: rng.int(7) }, () => rng.pick([...'0123456789abcdefABCDEF '])).join('')}>`;
  const comment = () => `%${Array.from({ length: rng.int(10) }, () => rng.pick([...'note ()<>[]/%x'])).join('')}${rng.pick(['\n', '\r', '\r\n'])}`;

  /** A nested value as text, at most `depth` deep. */
  const nested = (depth: number): string => {
    const choice = rng.int(depth > 0 ? 9 : 7);
    if (choice === 0) return number();
    if (choice === 1) return nameText();
    if (choice === 2) return stringText();
    if (choice === 3) return hexText();
    if (choice === 4) return rng.pick(['true', 'false', 'null']);
    if (choice === 5 || choice === 6) return number();
    const items: string[] = [];
    const dictionary = choice === 8;
    for (let index = rng.int(4); index > 0; index--) {
      if (dictionary) items.push(nameText());
      items.push(nested(depth - 1));
      if (rng.next() < 0.1) items.push(comment());
    }
    // Inside a value, separate items with a space unless one side is a delimiter.
    let text = dictionary ? '<<' : '[';
    for (const item of items) {
      const last = text.at(-1)!;
      text += ')>]['.includes(last) || last === '<' || '/(<[%'.includes(item[0]!) || last === '\n' || last === '\r' ? (rng.next() < 0.5 ? '' : ' ') : ' ';
      text += item;
    }
    return `${text}${dictionary ? '>>' : ']'}`;
  };

  const operand = () => {
    const choice = rng.int(10);
    let token: string;
    let kind: OperandKind;
    if (choice < 4) [token, kind] = [number(), 'number'];
    else if (choice < 6) [token, kind] = [nameText(), 'name'];
    else if (choice === 6) [token, kind] = [stringText(), 'string'];
    else if (choice === 7) [token, kind] = [hexText(), 'hex'];
    else if (choice === 8) {
      token = rng.pick(['true', 'false', 'null']);
      kind = token === 'null' ? 'null' : 'boolean';
    } else {
      token = nested(4);
      kind = token.startsWith('<<') ? 'dictionary' : token.startsWith('[') ? 'array' : token.startsWith('(') ? 'string' : token.startsWith('<') ? 'hex' : token.startsWith('/') ? 'name' : token === 'null' ? 'null' : token === 'true' || token === 'false' ? 'boolean' : 'number';
    }
    const start = put(token);
    run.push({ kind, start, end: start + token.length });
  };

  const operator = (name: string, mustSpace = false) => {
    put(name, mustSpace);
    built.push({ operator: name, operands: run });
    run = [];
  };

  for (let step = 30 + rng.int(60); step > 0; step--) {
    if (rng.next() < 0.1) source += comment();
    if (run.length === 0 && built.length > 0 && rng.next() < 0.06) {
      // A clear inline picture: no E in its data, a single space after ID and after EI, then Q.
      const width = 1 + rng.int(6);
      put('BI', true);
      source += ` /W ${width} /H 1 /BPC 8 /CS /G ID `;
      for (let index = 0; index < width; index++) {
        let byte = rng.int(256);
        if (byte === 0x45) byte = 0x46;
        source += String.fromCharCode(byte);
      }
      source += rng.pick(['', ' ']);
      source += 'EI ';
      operator('Q', true);
      continue;
    }
    let name = rng.pick(operators);
    // BX and EX stay balanced: EX only inside a BX, and the open ones closed at the end.
    if (name === 'EX' && open === 0) name = 'BX';
    if (name === 'BX') open++;
    if (name === 'EX') open--;
    for (let count = name === 'BX' || name === 'EX' ? 0 : rng.int(rng.next() < 0.1 ? 40 : 7); count > 0; count--) operand();
    operator(name);
  }
  for (; open > 0; open--) operator('EX');
  if (rng.next() < 0.3) source += comment();
  return { source, built };
}

const seeds = process.env.CONTENT_SEED ? [Number(process.env.CONTENT_SEED)] : [1, 2, 3, (Date.now() % 1_000_000) + 4];

describe.each(seeds)('generated streams, seed %i', (seed) => {
  it('report exactly the operators and runs built, a few hundred sequences', () => {
    for (let index = 0; index < 300; index++) {
      const each = seed * 1000 + index;
      const { source, built } = generate(each);
      const editor = recordingEditor(operators);
      const read = editContent(latin1(source), editor, 'alone', () => {});
      const where = `seed ${each}: ${JSON.stringify(source.slice(0, 300))}`;
      expect(read, where).toEqual({ kind: 'unchanged' });
      expect(editor.seen.map((seen) => seen.operator), where).toEqual(built.map((each) => each.operator));
      editor.seen.forEach(({ run }, at) => {
        const operands = built[at]!.operands;
        expect(run.count, where).toBe(operands.length);
        if (operands.length > 0) expect(run.start, where).toBe(operands[0]!.start);
        expect(run.numbers, where).toBe(operands.filter((operand) => operand.kind === 'number').length);
        expect(run.kinds, where).toBe(operands.reduce((bits, operand) => bits | kindBit[operand.kind], 0));
        expect(run.last, where).toEqual(operands.slice(-4));
      });
    }
  });
});
