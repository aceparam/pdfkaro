// Reading and editing drawing instructions (`editContent` in src/engines/content.ts): what must never be doubt,
// every doubt case left byte for byte, inline pictures, streams in sequence, the editor through the test-only
// editor, names as qpdf's JSON writes them, `PageTooLarge`, the fixed sentences, memory on a 64 MiB stream, PDF.js
// drawing the cases the inline rules were taken from, and every fixture through the reader. No request may be made.

import { Inflate } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  PageTooLarge,
  decodeContent,
  editContent,
  kindBit,
  maxContentBytes,
  maxEditedBytes,
  nameValue,
  numberValue,
  operandCounts,
  variableOperands,
  type Editor,
  type OperandKind,
  type Place,
  type Read,
  type Spend,
} from '../../src/engines/content';
import { inflatePrefix } from '../../src/engines/zlib';
import { freshQpdf } from '../../src/engines/plain';
import { readDictionaries } from '../../src/engines/qpdf-json';
import { open } from './stamp-helpers';
import { editPage, latin1, noRequests, pagePdf, qpdfTools, recordingBudget, recordingEditor, testEditor, text } from './content-helpers';

noRequests('the content reader');

const free: Spend = () => {};
const read = (source: string | Uint8Array, editor: Editor = recordingEditor([]), place: Place = 'alone', spend = free): Read => editContent(typeof source === 'string' ? latin1(source) : source, editor, place, spend);
const allOperators = Object.keys(operandCounts);

/** An operand's kind from its text, worked out here. */
function kindOf(token: string): OperandKind {
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(token)) return 'number';
  if (token.startsWith('/')) return 'name';
  if (token.startsWith('(')) return 'string';
  if (token.startsWith('<<')) return 'dictionary';
  if (token.startsWith('<')) return 'hex';
  if (token.startsWith('[')) return 'array';
  if (token === 'true' || token === 'false') return 'boolean';
  if (token === 'null') return 'null';
  throw new Error(`no kind for ${token}`);
}

/** What the editor must see for a stream: each operator with its operands' texts. */
function expectSeen(source: string, expected: [string, string[]][]) {
  const editor = recordingEditor(allOperators);
  expect(read(source, editor)).toEqual({ kind: 'unchanged' });
  expect(editor.seen.map(({ operator }) => operator)).toEqual(expected.map(([operator]) => operator));
  editor.seen.forEach(({ run }, index) => {
    const tokens = expected[index]![1];
    expect(run.count).toBe(tokens.length);
    expect(run.numbers).toBe(tokens.filter((token) => kindOf(token) === 'number').length);
    expect(run.kinds).toBe(tokens.reduce((bits, token) => bits | kindBit[kindOf(token)], 0));
    const last = tokens.slice(-4);
    expect(run.last.map((operand) => operand.kind)).toEqual(last.map(kindOf));
    expect(run.last.map((operand) => source.slice(operand.start, operand.end))).toEqual(last);
    if (tokens.length > 0) expect(source.slice(run.start).startsWith(tokens[0]!)).toBe(true);
  });
}

/** Builds a stream from operators and their operands, separated by spaces. */
const build = (list: [string, string[]][]) => list.map(([operator, tokens]) => [...tokens, operator].join(' ')).join('\n');

/** One example of each of the 73 operators with its operands; BI, ID and EI as one clear inline picture. */
const everyOperator: [string, string[]][] = [
  ['w', ['1']], ['J', ['0']], ['j', ['0']], ['M', ['10']], ['d', ['[1 2]', '0']], ['ri', ['/RelativeColorimetric']], ['i', ['1']], ['gs', ['/GS0']],
  ['q', []], ['Q', []], ['cm', ['1', '0', '0', '1', '0', '0']], ['m', ['0', '0']], ['l', ['1', '1']], ['c', ['1', '2', '3', '4', '5', '6']],
  ['v', ['1', '2', '3', '4']], ['y', ['1', '2', '3', '4']], ['h', []], ['re', ['0', '0', '1', '1']], ['S', []], ['s', []], ['f', []], ['F', []],
  ['f*', []], ['B', []], ['B*', []], ['b', []], ['b*', []], ['n', []], ['W', []], ['W*', []], ['BT', []], ['ET', []], ['Tc', ['1']], ['Tw', ['1']],
  ['Tz', ['100']], ['TL', ['12']], ['Tf', ['/F1', '12']], ['Tr', ['0']], ['Ts', ['0']], ['Td', ['1', '1']], ['TD', ['1', '1']],
  ['Tm', ['1', '0', '0', '1', '0', '0']], ['T*', []], ['Tj', ['(a)']], ['TJ', ['[(a) -20 (b)]']], ["'", ['(a)']], ['"', ['1', '2', '(a)']],
  ['d0', ['1', '0']], ['d1', ['1', '0', '0', '0', '1', '1']], ['CS', ['/CS0']], ['cs', ['/CS0']], ['SC', ['1']], ['SCN', ['1', '/P0']], ['sc', ['1']],
  ['scn', ['1', '/P0']], ['G', ['0']], ['g', ['0']], ['RG', ['0', '0', '0']], ['rg', ['0', '0', '0']], ['K', ['0', '0', '0', '0']],
  ['k', ['0', '0', '0', '0']], ['sh', ['/Sh0']], ['Do', ['/Im0']], ['MP', ['/Tag']], ['DP', ['/Tag', '<</A 1>>']], ['BMC', ['/Tag']],
  ['BDC', ['/Tag', '<</MCID 0>>']], ['EMC', []], ['BX', []], ['EX', []],
]; // prettier-ignore

describe('valid input is never doubt', () => {
  it('every one of the 73 operators with its operands, and a clear inline picture', () => {
    const named = new Set(everyOperator.map(([operator]) => operator));
    expect([...allOperators].filter((operator) => !named.has(operator)).sort()).toEqual(['BI', 'EI', 'ID']);
    expect(allOperators.length).toBe(73);
    const source = `${build(everyOperator)}\nBI /W 1 /H 1 /BPC 8 /CS /G ID a EI Q 0 g`;
    // The inline picture's operators are not offered to the editor.
    expectSeen(source, [...everyOperator, ['Q', []], ['g', ['0']]]);
  });

  it.each([
    ['glued arrays and strings', '[(a)-20(b)]TJ', [['TJ', ['[(a)-20(b)]']]]],
    ['glued names', '/a/b DP', [['DP', ['/a', '/b']]]],
    ['a glued dictionary', '/P<</MCID 0>>BDC', [['BDC', ['/P', '<</MCID 0>>']]]],
    ['true, false and null', 'true false null [true false null] n', [['n', ['true', 'false', 'null', '[true false null]']]]],
    ['CR-only and CRLF line ends, FF as whitespace', 'q\rQ\r\nq\fQ\t', [['q', []], ['Q', []], ['q', []], ['Q', []]]],
    ['comments mid-line and inside arrays', 'q % note\nQ [1 % c\n 2] 0 d %end', [['q', []], ['Q', []], ['d', ['[1 % c\n 2]', '0']]]],
    ['names with #xx', '/A#20B BMC', [['BMC', ['/A#20B']]]],
    ['an empty name', '/ MP', [['MP', ['/']]]],
    ['nothing at all', '', []],
    ['hex strings', '<48 65>Tj <>Tj', [['Tj', ['<48 65>']], ['Tj', ['<>']]]],
    ['escapes and nested parentheses in a string', '(a\\)b\\\\(c)d\\\r\n) Tj', [['Tj', ['(a\\)b\\\\(c)d\\\r\n)']]]],
    ['numbers in every form', `1 -2 +3 4. .5 -.5 +0.25 ${new Array<string>(26).fill('0').join(' ')} SCN`, [['SCN', ['1', '-2', '+3', '4.', '.5', '-.5', '+0.25', ...new Array<string>(26).fill('0')]]]],
    ['six operands before sc, a name first', '/P0 1 2 3 4 5 sc', [['sc', ['/P0', '1', '2', '3', '4', '5']]]],
    ['any byte inside a string', '(\x00\x01\xff\x80) Tj', [['Tj', ['(\x00\x01\xff\x80)']]]],
  ] as [string, string, [string, string[]][]][])('%s', (_, source, expected) => expectSeen(source, expected));

  it('32 mixed levels of arrays and dictionaries, each one operand', () => {
    let nested = '1';
    for (let level = 0; level < 32; level++) nested = level % 2 === 0 ? `[${nested}]` : `<</K ${nested}>>`;
    expectSeen(`${nested} MP`, [['MP', [nested]]]);
  });

  it('sc after six operands: a count of 6, 5 numbers, the name in the summary, the last four with their spans', () => {
    const editor = recordingEditor(['sc']);
    read('/P0 1 2 3 4 5 sc', editor);
    const run = editor.seen[0]!.run;
    expect(run).toMatchObject({ count: 6, start: 0, numbers: 5, kinds: kindBit.name | kindBit.number });
    expect(run.last).toEqual([
      { kind: 'number', start: 6, end: 7 },
      { kind: 'number', start: 8, end: 9 },
      { kind: 'number', start: 10, end: 11 },
      { kind: 'number', start: 12, end: 13 },
    ]);
  });
});

const doubtCases: [string, string][] = [
  ['glued numbers and operator', '0.5 0.5 0.5rg'],
  ['glued operators', 'BT ETQ'],
  ['a number with two dots', '1.2.3 w'],
  ['a NUL', 'q\x00Q'],
  ['another control byte', 'q\x01Q'],
  ['a byte over 0x7F outside a string', 'q \x80 Q'],
  ['a name holding a NUL', '/A\x00rg BMC'],
  ['a name holding a byte over 0x7F', '/A\x80 BMC'],
  ['{', '{ q }'],
  ['}', 'q }'],
  ['a stray )', 'q ) Q'],
  ['a lone >', 'q > Q'],
  ['an unterminated string', '(abc Tj'],
  ['an unterminated array', '[1 2 0 d'],
  ['an unterminated dictionary', '/P <</A 1 BDC'],
  ['an unbalanced ]', '1 ] 0 d'],
  ['an unbalanced >>', '/A 1 >> MP'],
  ['a mismatched ]', '[1 >> 0 d'],
  ['a mismatched >>', '<</A [1 >> ] MP'],
  ['33 nested levels', `${'['.repeat(33)}${']'.repeat(33)} MP`],
  ['an operator inside an array', '[ 1 rg ]'],
  ['an operator inside a dictionary', '<< /A q >> MP'],
  ['ID with no BI', 'ID'],
  ['EI with no BI', 'q EI'],
  ['BX with no EX', 'BX q'],
  ['EX with no BX', 'q EX'],
  ['an unknown operator', 'q foo Q'],
  ['an unknown operator inside BX and EX', 'BX 1 0 0 rgx EX'],
  ['two known operators glued inside BX and EX', 'BX Qf EX'],
  ['a bad hex string', '<4G> Tj'],
  ['a hex string with a NUL', '<4\x001> Tj'],
  ['a bad # in a name', '/A#4G BMC'],
  ['# at the end of a name', '/A# BMC'],
  ['a dot', '. w'],
  ['a plus', '+ w'],
  ['minus dot', '-. w'],
  ['an exponent', '1e5 w'],
  ['two minus signs', '--1 w'],
  ['operands waiting at the end', 'q 1 0 0'],
  ['a lone string at the end', '(a)'],
];

describe('what counts as doubt', () => {
  it.each(doubtCases)('%s is doubt and left byte for byte', (_, source) => {
    const stream = latin1(source);
    expect(read(stream, testEditor())).toEqual({ kind: 'doubt' });
    const page = editPage([stream], testEditor());
    expect(page.left).toBe(true);
    expect(page.streams[0]).toBe(stream);
    expect(stream).toEqual(latin1(source));
  });

  it('an edited stream past 3 × 64 MiB is doubt, with nothing allocated or spent', () => {
    // 100,000 small operators, each edited into a piece of 2,015 bytes.
    const piece = ` ${'0 '.repeat(1007)}`;
    const editor: Editor = { operators: new Set(['n']), edit: () => ({ after: piece }) };
    const spend = recordingBudget();
    const before = process.memoryUsage().arrayBuffers;
    expect(read('n '.repeat(100_000), editor, 'alone', spend)).toEqual({ kind: 'doubt' });
    expect(spend.calls).toEqual([]);
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(16 * 1024 * 1024);
    expect(100_000 * piece.length).toBeGreaterThan(maxEditedBytes);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// Inline pictures

const pic = (dict = '/W 2 /H 1 /BPC 8 /CS /G', data = 'ab', tail = ' EI Q 0 1 0 rg') => `q 1 0 0 rg BI ${dict} ID ${data}${tail}`;

describe('inline pictures', () => {
  it.each([
    ['no filter', pic()],
    ['an empty filter array', pic('/W 2 /H 1 /BPC 8 /CS /G /F []')],
    ['long key names', pic('/Width 2 /Height 1 /BitsPerComponent 8 /ColorSpace /DeviceGray')],
    ['RGB at 4 bits', pic('/W 3 /H 2 /BPC 4 /CS /RGB', 'abcdefghij')],
    ['an image mask', pic('/W 9 /H 2 /IM true', 'abcd')],
    ['an image mask with BPC 1', pic('/W 8 /H 1 /IM true /BPC 1', 'a')],
    ['other keys', pic('/W 2 /H 1 /BPC 8 /CS /G /D [1 0] /I true /DP << /K 1 >>')],
    ['a matching /L', pic('/W 2 /H 1 /BPC 8 /CS /G /L 2')],
    ['ASCIIHex', pic('/W 2 /H 1 /BPC 8 /CS /G /F /AHx', '61 62>')],
    ['ASCIIHex in an array, a matching /L', pic('/W 2 /H 1 /BPC 8 /CS /G /F [/ASCIIHexDecode] /L 5', '6162>')],
    ['ASCII85', pic('/W 2 /H 1 /BPC 8 /CS /G /F /A85', '@:B~>')],
    ['whitespace before EI', pic(undefined, 'ab', ' \n EI Q 0 1 0 rg')],
    ['EI at the end of a stream read alone', 'q BI /W 2 /H 1 /BPC 8 /CS /G ID abEI'],
    ['only spaces after EI to the end', 'q BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI    '],
    ['binary data', `q BI /W 4 /H 1 /BPC 8 /CS /G ID \x00\xff\x45\x80 EI Q`],
    ['up to four numbers before sc', pic(undefined, 'ab', ' EI 1 2 3 4 sc 0 0 9 9 re f')],
    ['names and numbers before scn', pic(undefined, 'ab', ' EI 1 /P0 scn 0 0 9 9 re f')],
  ])('%s is stepped over', (_, source) => {
    const editor = recordingEditor(allOperators);
    expect(read(source, editor)).toEqual({ kind: 'unchanged' });
    expect(editor.seen.length).toBeGreaterThan(0);
  });

  it('the operators on both sides reach the editor', () => {
    const editor = recordingEditor(['q', 'rg', 'Q']);
    read(pic(), editor);
    expect(editor.seen.map(({ operator }) => operator)).toEqual(['q', 'rg', 'Q', 'rg']);
  });

  it.each([
    ['a false end in the data', pic('/W 4 /H 1 /BPC 8 /CS /G', 'xEI ')],
    ['EI before a NUL in the data', pic('/W 4 /H 1 /BPC 8 /CS /G', 'xEI\x00')],
    ['EI before a tab in the data', pic('/W 4 /H 1 /BPC 8 /CS /G', 'xEI\t')],
    ['EI before a delimiter in the data', pic('/W 4 /H 1 /BPC 8 /CS /G', 'xEI/')],
    ['EI in the whitespace before the real end', `q BI /W 2 /H 1 /BPC 8 /CS /G ID abEI\x00EI Q`],
    ['data E then EI', pic('/W 1 /H 1 /BPC 8 /CS /G', 'E', 'EI Q 0 1 0 rg')],
    ['data aE then EI', pic(undefined, 'aE', 'EI Q 0 1 0 rg')],
    ['data EI then EI', pic(undefined, 'EI', 'EI Q 0 1 0 rg')],
    ['a stray ~ in ASCII85', pic('/W 2 /H 1 /BPC 8 /CS /G /F /A85', '@:~B~>')],
    ['~ not followed by >', pic('/W 2 /H 1 /BPC 8 /CS /G /F /A85', '@:B~ >')],
    ['ASCIIHex with another byte', pic('/W 2 /H 1 /BPC 8 /CS /G /F /AHx', '61 x62>')],
    ['CR LF after ID', pic(undefined, '\nab').replace('ID \n', 'ID\r\n')],
    ['no whitespace after ID', 'q BI /W 2 /H 1 /BPC 8 /CS /G ID/ab EI Q'],
    ['/F /Fl', pic('/W 2 /H 1 /BPC 8 /CS /G /F /Fl')],
    ['/F /DCT', pic('/W 2 /H 1 /BPC 8 /CS /G /F /DCT')],
    ['/F [/A85 /Fl]', pic('/W 2 /H 1 /BPC 8 /CS /G /F [/A85 /Fl]', '@:B~>')],
    ['a named colour space', pic('/W 2 /H 1 /BPC 8 /CS /CS0')],
    ['an indexed colour space', pic('/W 2 /H 1 /BPC 8 /CS [/I /RGB 1 <000000ffffff>]')],
    ['a key that is not a name', pic('/W 2 /H 1 /BPC 8 /CS /G 5 /X')],
    ['a key with no value', pic('/W 2 /H 1 /BPC 8 /CS /G /X')],
    ['a key given twice', pic('/W 2 /W 2 /H 1 /BPC 8 /CS /G')],
    ['a short and a long key', pic('/W 2 /Width 2 /H 1 /BPC 8 /CS /G')],
    ['/IM true with /CS', pic('/W 8 /H 1 /IM true /CS /G', 'a')],
    ['/IM true with BPC 8', pic('/W 2 /H 1 /IM true /BPC 8')],
    ['no CS without IM', pic('/W 2 /H 1 /BPC 8')],
    ['no BPC without IM', pic('/W 2 /H 1 /CS /G')],
    ['/W 2.0', pic('/W 2.0 /H 1 /BPC 8 /CS /G')],
    ['BPC 3', pic('/W 2 /H 1 /BPC 3 /CS /G')],
    ['a string value', pic('/W 2 /H 1 /BPC 8 /CS /G /X (a)')],
    ['a wrong /L', pic('/W 2 /H 1 /BPC 8 /CS /G /L 3')],
    ['W, H and BPC past the data', pic('/W 99999 /H 99999 /BPC 16 /CS /CMYK')],
    ['W, H and BPC past the largest safe number', pic('/W 999999999999999 /H 999999999999999 /BPC 16 /CS /CMYK')],
    ['EI followed by a tab', pic(undefined, 'ab', ' EI\tQ 0 1 0 rg')],
    ['EI followed by a form feed', pic(undefined, 'ab', ' EI\fQ 0 1 0 rg')],
    ['EI followed by a NUL', pic(undefined, 'ab', ' EI\x00Q 0 1 0 rg')],
    ['EI followed by /', pic(undefined, 'ab', ' EI/F1 12 Tf')],
    ['a byte outside printable ASCII within 15 bytes', pic(undefined, 'ab', ' EI Q (\x80) Tj 0 1 0 rg')],
    ['a tab within 15 bytes', pic(undefined, 'ab', ' EI Q\t0 1 0 rg')],
    ['a comment before the next operator', pic(undefined, 'ab', ' EI %c\nQ 0 1 0 rg')],
    ['a string before the next operator', pic(undefined, 'ab', ' EI (a) Tj 0 1 0 rg')],
    ['true before the next operator', pic(undefined, 'ab', ' EI true false null n')],
    ['an array before the next operator', pic(undefined, 'ab', ' EI [1] 0 d')],
    ['a wrong first operand count', pic(undefined, 'ab', ' EI 1 Q 1 0 0 rg')],
    ['five numbers before sc', pic(undefined, 'ab', ' EI 1 2 3 4 5 sc')],
    ['the next operator past 75 bytes', pic(undefined, 'ab', ` EI ${'0 '.repeat(40)}0 0 0 rg`)],
    ['operands before BI', 'q 1 BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI Q'],
    ['a comment in the dictionary', pic('/W 2 %c\n/H 1 /BPC 8 /CS /G')],
    ['no EI', 'q BI /W 2 /H 1 /BPC 8 /CS /G ID ab Q'],
  ])('%s is doubt and left byte for byte', (_, source) => {
    const stream = latin1(source);
    expect(read(stream, testEditor())).toEqual({ kind: 'doubt' });
    expect(editPage([stream], testEditor()).streams[0]).toBe(stream);
  });

  it('the look-ahead must lie inside a page stream that is not the last', () => {
    expect(read('BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI Q 0 1 0 rg 0 0 9 9 re f\n', undefined, 'not-last')).toEqual({ kind: 'unchanged' });
    expect(read('BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI Q\n', undefined, 'not-last')).toEqual({ kind: 'doubt' });
    expect(read('BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI\n', undefined, 'not-last')).toEqual({ kind: 'doubt' });
    expect(read('BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI                     \n', undefined, 'not-last')).toEqual({ kind: 'doubt' });
    expect(read('BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI Q\n', undefined, 'last')).toEqual({ kind: 'unchanged' });
    expect(read('BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI', undefined, 'not-last')).toEqual({ kind: 'doubt' });
  });
});

// ---------------------------------------------------------------------------

describe('streams in sequence', () => {
  it.each([
    ['a number', '0 0 1', '0 RG'],
    ['an operator', 'q 1 0 0 r', 'g'],
    ['a string', '(ab', 'c) Tj'],
    ['a dictionary', '/P <</MCID', ' 0>> BDC EMC'],
    ['operands waiting', '1 0 0 ', 'rg'],
    ['a comment with no line end', 'q % note', '1 0 0 rg'],
    ['no whitespace at the end', 'q', ' Q'],
  ])('%s split between two streams: the first is doubt and both are left', (_, first, second) => {
    const streams = [latin1(first), latin1(second)];
    const page = editPage(streams, testEditor());
    expect(page.reads[0]).toEqual({ kind: 'doubt' });
    expect(page.left).toBe(true);
    expect(page.streams[0]).toBe(streams[0]);
    expect(page.streams[1]).toBe(streams[1]);
  });

  it('the last stream, and a form read alone, may end with a comment and no line end, or with Q', () => {
    for (const place of ['last', 'alone'] as const) {
      expect(read('q 1 w % note', undefined, place)).toEqual({ kind: 'unchanged' });
      expect(read('q 1 w Q', undefined, place)).toEqual({ kind: 'unchanged' });
    }
    expect(read('q 1 w Q\n', undefined, 'not-last')).toEqual({ kind: 'unchanged' });
    expect(read('', undefined, 'not-last')).toEqual({ kind: 'unchanged' });
  });

  it('a stream shared as a page first stream and read alone elsewhere is read once, by the stricter rules', () => {
    const shared = latin1('q 2 w Q');
    // Its strictest place is not-last: there it is doubt, so every page that uses it leaves it.
    const strictest = (places: Place[]) => (['not-last', 'last', 'alone'] as Place[]).find((place) => places.includes(place))!;
    const place = strictest(['alone', 'not-last']);
    expect(place).toBe('not-last');
    expect(read(shared, testEditor(), place)).toEqual({ kind: 'doubt' });
    expect(read(shared, testEditor(), 'alone').kind).toBe('edited');
  });

  it('a page with a doubt stream leaves every stream, edited ones too', () => {
    const streams = [latin1('2 w\n'), latin1('q }')];
    const page = editPage(streams, testEditor());
    expect(page.reads[0]!.kind).toBe('edited');
    expect(page.left).toBe(true);
    expect(page.streams).toBe(streams);
  });
});

// ---------------------------------------------------------------------------

describe('the editor', () => {
  const source = '% start\n2 w 0 0 9 9 re (a re) Tj /CS0 cs 1 0 0 1 5 5 cm BI /W 1 /H 1 /BPC 8 /CS /G ID w EI 1 0 d0 S\n3 4 w 1 0 0 1 0 0 cm';

  it('edits only at the operators it names, every other byte unchanged, the length worked out first', () => {
    const editor = testEditor();
    const spend = recordingBudget();
    const result = read(source, editor, 'alone', spend);
    const expected =
      '% start\n2  w 2 w  0 0 9 9 re h  (a re) Tj  /CS9  cs 0 scn   q 1 0 0 1 5 5 cm BI /W 1 /H 1 /BPC 8 /CS /G ID w EI   S\n3 4 w  q 1 0 0 1 0 0 cm';
    expect(result.kind).toBe('edited');
    if (result.kind !== 'edited') return;
    expect(text(result.data)).toBe(expected);
    // w (one number), re, cs (not counting), cm twice, d0 removed: 5 that count, 6 in all.
    expect(result.edits).toBe(5);
    expect(result.allEdits).toBe(6);
    expect(spend.calls).toEqual([expected.length]);
    // `3 4 w` has two operands, so the editor left it; each pass asks the same.
    expect(editor.calls.filter((call) => call.operator === 'w').map((call) => call.run.count)).toEqual([1, 2, 1, 2]);
  });

  it('edits at the start and end of a stream, and with no operands', () => {
    const editor: Editor = { operators: new Set(['q', 'Q']), edit: (operator) => (operator === 'q' ? { before: ' 0 g ' } : { after: ' 1 g ' }) };
    const result = read('q Q', editor);
    expect(result.kind === 'edited' && text(result.data)).toBe(' 0 g q Q 1 g ');
  });

  it('replaces the operator alone, keeping its operands', () => {
    const editor: Editor = { operators: new Set(['rg']), edit: () => ({ operator: ' rg 0 g ' }) };
    const result = read('1 0 0 rg', editor);
    expect(result.kind === 'edited' && text(result.data)).toBe('1 0 0  rg 0 g ');
  });

  it('only edits that do not count: none of them counts', () => {
    const result = read('/CS0 cs 0 0 9 9 re', testEditor());
    expect(result).toMatchObject({ kind: 'edited', edits: 1, allEdits: 2 });
    const onlyCs = read('/CS0 cs', testEditor());
    expect(onlyCs).toMatchObject({ kind: 'edited', edits: 0, allEdits: 1 });
  });

  it('unchanged with nothing allocated or spent when nothing is edited', () => {
    const spend = recordingBudget();
    expect(read('q 1 0 0 rg Q', testEditor(), 'alone', spend)).toEqual({ kind: 'unchanged' });
    expect(spend.calls).toEqual([]);
  });

  it('doubt from the editor leaves the whole stream', () => {
    const stream = latin1(source);
    expect(read(stream, testEditor(['S']))).toEqual({ kind: 'doubt' });
    expect(editPage([stream], testEditor(['S'])).streams[0]).toBe(stream);
  });

  const pieceSentence = 'An edit to drawing instructions must be whole tokens between spaces.';
  it.each([
    ['no space before', { after: '0 g ' }],
    ['no space after', { before: ' 0 g' }],
    ['a %', { after: ' % c ' }],
    ['a (', { after: ' (a) Tj ' }],
    ['a <', { after: ' <00> Tj ' }],
    ['a [', { after: ' [1] 0 d ' }],
    ['a {', { after: ' { ' }],
    ['BI', { after: ' BI ' }],
    ['ID', { operator: ' ID ' }],
    ['EI', { operator: ' EI ' }],
    ['an unknown operator', { after: ' foo ' }],
    ['glued tokens', { after: ' 0g ' }],
    ['a line end', { after: ' 0\ng ' }],
    ['a byte over 0x7E', { after: ' /\u00e9 ' }],
    ['an empty before', { before: '' }],
    ['an empty after', { after: '' }],
  ])('a piece with %s is refused with the fixed sentence', (_, edit) => {
    const editor: Editor = { operators: new Set(['rg']), edit: () => edit };
    expect(() => read('1 0 0 rg', editor)).toThrow(new Error(pieceSentence));
  });

  it('operands on an operator that has none are refused', () => {
    const editor: Editor = { operators: new Set(['q']), edit: () => ({ operands: ' 1 ' }) };
    expect(() => read('q', editor)).toThrow(new Error(pieceSentence));
  });

  it('a piece refused only in the second pass is refused there too, with no edited copy', () => {
    let calls = 0;
    const editor: Editor = { operators: new Set(['q']), edit: () => (++calls > 1 ? { after: '0 g' } : { after: ' 0 g ' }) };
    expect(() => read('q', editor)).toThrow(new Error(pieceSentence));
  });

  it('an editor that answers differently the second time is refused with the fixed sentence, not a range error', () => {
    const sentence = 'The edited drawing instructions did not come out as worked out.';
    let calls = 0;
    const longer: Editor = { operators: new Set(['q']), edit: () => ({ after: ++calls > 1 ? ' 0 0 0 rg ' : ' 0 g ' }) };
    expect(() => read('q', longer)).toThrow(new Error(sentence));
    calls = 0;
    const shorter: Editor = { operators: new Set(['q']), edit: () => ({ after: ++calls > 1 ? ' 1 g ' : ' 0 g ' }) };
    expect(() => read('q', shorter)).toThrow(new Error(sentence));
    calls = 0;
    const doubtLater: Editor = { operators: new Set(['q']), edit: () => (++calls > 1 ? 'doubt' : { after: ' 0 g ' }) };
    expect(() => read('q', doubtLater)).toThrow(new Error(sentence));
    calls = 0;
    const fewer: Editor = { operators: new Set(['q']), edit: () => (++calls > 2 ? null : { after: ' 0 g ' }) };
    expect(() => read('q q', fewer)).toThrow(new Error(sentence));
  });

  it("calls the budget with the edited length before the copy is made, and passes on the caller's error", () => {
    const spend = recordingBudget(3);
    expect(() => read('1 w', testEditor(), 'alone', spend)).toThrow('over');
    expect(spend.calls).toEqual([' 1  w 2 w '.length - 1]);
  });

  it('reads names and numbers', () => {
    const editor = recordingEditor(['Tf']);
    const data = latin1('/F#31 -12.5 Tf');
    read(data, editor);
    const [name, size] = editor.seen[0]!.run.last;
    expect(nameValue(data, name!)).toBe('/F1');
    expect(numberValue(data, size!)).toBe(-12.5);
    expect(numberValue(latin1('4.'), { kind: 'number', start: 0, end: 2 })).toBe(4);
    expect(numberValue(latin1('-.5'), { kind: 'number', start: 0, end: 3 })).toBe(-0.5);
  });
});

describe('names as qpdf reads them', () => {
  it('nameValue matches qpdf’s JSON keys, and gives nothing for a name that is not UTF-8', async () => {
    const names = ['/A#20B', '/C#e9', '/D#c3#a9'];
    const file = pagePdf([{ data: latin1('q Q') }], { extra: [`<< ${names.map((name, index) => `${name} ${index}`).join(' ')} >>`] });
    const dictionaries = readDictionaries(await freshQpdf(qpdfTools, file), []);
    const extra = [...dictionaries!.objects.values()].find((entry) => 'value' in entry && typeof entry.value === 'object' && entry.value !== null && Object.values(entry.value).includes(2));
    const keys = Object.keys((extra as { value: Record<string, number> }).value);
    const values = names.map((name) => nameValue(latin1(name), { kind: 'name', start: 0, end: name.length }));
    expect(values).toEqual(['/A B', undefined, '/Dé']);
    expect(keys).toContain('/A B');
    expect(keys).toContain('/Dé');
    expect(keys).toContain('n:/C#e9');
  });
});

describe('PageTooLarge and the fixed sentences', () => {
  it('carries its page and a fixed, neutral message', () => {
    const error = new PageTooLarge(14);
    expect(error.name).toBe('PageTooLarge');
    expect(error.page).toBe(14);
    expect(error.message).toBe('A page has too much drawing on it to work on here.');
    expect(error).toBeInstanceOf(Error);
  });

  it.each([0, 1.5, -3, Number.NaN, 2 ** 53])('refuses %s with a plain error', (page) => {
    let caught: unknown;
    try {
      new PageTooLarge(page);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(PageTooLarge);
    expect((caught as Error).message).toBe('A page number must be a whole number from 1 up.');
  });

  it('every sentence the reader and the zlib steps throw is on the list', () => {
    const list = [
      'A page has too much drawing on it to work on here.',
      'A page number must be a whole number from 1 up.',
      'The edited drawing instructions did not come out as worked out.',
      'An edit to drawing instructions must be whole tokens between spaces.',
      'The start of zlib data was asked for an impossible length.',
    ];
    const messages: string[] = [];
    const catching = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        messages.push((error as Error).message);
      }
    };
    catching(() => {
      throw new PageTooLarge(1);
    });
    catching(() => new PageTooLarge(0));
    let calls = 0;
    catching(() => read('(secret) Tj q', { operators: new Set(['q']), edit: () => ({ after: ++calls > 1 ? ' 1 1 g ' : ' 1 g ' }) }));
    catching(() => read('(secret) Tj q', { operators: new Set(['q']), edit: () => ({ after: '(secret)' }) }));
    catching(() => inflatePrefix(new Uint8Array(10), Inflate, 0));
    expect(messages).toEqual(list);
    for (const message of messages) expect(message).not.toContain('secret');
  });
});

// ---------------------------------------------------------------------------

describe('drawn by PDF.js', () => {
  it('a page edited by the test-only editor reads the same text at the same places', async () => {
    const before = latin1('2 w 0 0 50 50 re S /CS0 cs 1 0 0 1 10 10 cm BT /F1 12 Tf 20 100 Td (Hello) Tj ET 1 0 d0 BT /F1 9 Tf 5 5 Td (there) Tj ET');
    const result = read(before, testEditor());
    expect(result.kind).toBe('edited');
    const after = (result as { data: Uint8Array }).data;
    const places = async (stream: Uint8Array) => {
      const doc = await open(pagePdf([{ data: stream }]));
      const content = await (await doc.getPage(1)).getTextContent();
      await doc.loadingTask.destroy();
      return content.items.map((item) => ('str' in item ? [item.str, item.transform.map((value: number) => Math.round(value * 100) / 100)] : null));
    };
    const original = await places(before);
    expect(original.map((item) => item?.[0]).join('')).toContain('Hello');
    expect(await places(after)).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// Memory and time

describe('memory and time', () => {
  const sample = () => process.memoryUsage();
  const mib = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;

  it('a 64 MiB stream of `q ` with no edit, and with every q replaced by ` q `', () => {
    const stream = new Uint8Array(maxContentBytes);
    for (let at = 0; at < stream.length; at += 2) {
      stream[at] = 0x71;
      stream[at + 1] = 0x20;
    }
    globalThis.gc?.();
    const base = sample();
    let peakBuffers = base.arrayBuffers;
    let peakHeap = base.heapUsed;
    let calls = 0;
    const watch = () => {
      const now = sample();
      peakBuffers = Math.max(peakBuffers, now.arrayBuffers);
      peakHeap = Math.max(peakHeap, now.heapUsed);
    };
    const quiet: Editor = {
      operators: new Set(['q']),
      edit: () => {
        if (++calls % 1_000_000 === 0) watch();
        return null;
      },
    };
    let started = performance.now();
    expect(editContent(stream, quiet, 'alone', free)).toEqual({ kind: 'unchanged' });
    const plainTime = performance.now() - started;
    watch();
    const plainGrowth = { buffers: peakBuffers - base.arrayBuffers, heap: peakHeap - base.heapUsed };
    const replace = { operator: ' q ' };
    const editing: Editor = {
      operators: new Set(['q']),
      edit: () => {
        if (++calls % 1_000_000 === 0) watch();
        return replace;
      },
    };
    let edited = 0;
    started = performance.now();
    const result = editContent(stream, editing, 'alone', (bytes) => {
      edited = bytes;
    });
    const editTime = performance.now() - started;
    watch();
    expect(result.kind).toBe('edited');
    expect(edited).toBe(2 * maxContentBytes);
    const editGrowth = { buffers: peakBuffers - base.arrayBuffers - edited, heap: peakHeap - base.heapUsed };
    console.info(`64 MiB of "q ": read in ${Math.round(plainTime)} ms, growth ${mib(plainGrowth.buffers)} MiB buffers, ${mib(plainGrowth.heap)} MiB heap; edited (128 MiB) in ${Math.round(editTime)} ms, growth beyond the copy ${mib(editGrowth.buffers)} MiB buffers, ${mib(editGrowth.heap)} MiB heap`);
    for (const growth of [plainGrowth.buffers, plainGrowth.heap, editGrowth.buffers, editGrowth.heap]) expect(growth).toBeLessThan(16 * 1024 * 1024);
    // Each pass under 10 s (two passes for the edit).
    expect(plainTime).toBeLessThan(10_000);
    expect(editTime).toBeLessThan(20_000);
  }, 120_000);

  it('a four-step chain whose middle step reaches the cap stays under the raw data plus 3 × 64 MiB plus 2 MiB', async () => {
    const { ascii85, runLength } = await import('./content-helpers');
    const { deflateSync } = await import('node:zlib');
    // The last step's input: Flate of 32 MiB of spaces. RunLength of it, run-length encoded again so the middle
    // step's output is near the cap, then ASCII85.
    const flateData = new Uint8Array(deflateSync(Buffer.alloc(32 * 1024 * 1024, 0x20)));
    const inner = runLength(flateData);
    // The second RunLength step makes `inner` padded with literal runs to just under the cap.
    const padding = maxContentBytes - inner.length - 1024;
    // The second RunLength step's output: `inner`, then spaces up to the padding (ignored after inner's end mark).
    const parts: number[] = [];
    for (let from = 0; from < inner.length; from += 128) {
      const piece = inner.subarray(from, from + 128);
      parts.push(piece.length - 1, ...piece);
    }
    let left = padding;
    while (left >= 128) {
      parts.push(129, 0x20);
      left -= 128;
    }
    if (left > 0) parts.push(257 - Math.max(2, left), 0x20);
    parts.push(128);
    const raw = ascii85(Uint8Array.from(parts));
    globalThis.gc?.();
    const base = sample().arrayBuffers;
    let peak = base;
    const spend = () => {
      peak = Math.max(peak, sample().arrayBuffers);
    };
    const started = performance.now();
    const result = decodeContent(raw, { '/Filter': ['/ASCII85Decode', '/RunLengthDecode', '/RunLengthDecode', '/FlateDecode'] }, () => undefined, Inflate, spend);
    const took = performance.now() - started;
    peak = Math.max(peak, sample().arrayBuffers);
    expect(result.kind).toBe('decoded');
    expect((result as { data: Uint8Array }).data.length).toBe(32 * 1024 * 1024);
    console.info(`four-step chain: raw ${mib(raw.length)} MiB, middle step ${mib(inner.length + padding)} MiB, decoded in ${Math.round(took)} ms, arrayBuffers growth ${mib(peak - base)} MiB`);
    expect(peak - base).toBeLessThan(raw.length + 3 * maxContentBytes + 2 * 1024 * 1024);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// PDF.js agreement

type Op = { fn: number; args: unknown };
async function operators(stream: string, resources?: string): Promise<{ names: string[]; ops: Op[] }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const picture = { dict: '/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8', data: Uint8Array.of(0x80) };
  const doc = await open(pagePdf([{ data: latin1(stream) }], resources ? { resources, extra: [picture] } : {}));
  const list = await (await doc.getPage(1)).getOperatorList();
  await doc.loadingTask.destroy();
  const byId = Object.fromEntries(Object.entries(pdfjs.OPS).map(([name, id]) => [id, name]));
  return { names: list.fnArray.map((fn: number) => byId[fn]!), ops: list.fnArray.map((fn: number, index: number) => ({ fn, args: list.argsArray[index] })) };
}
const afterPicture = (names: string[]) => names.slice(names.findIndex((name) => name === 'paintInlineImageXObject' || name === 'paintImageMaskXObject') + 1);
const fillSeen = (names: string[]) => {
  const after = afterPicture(names);
  return after.includes('setFillRGBColor') && after.some((name) => name.startsWith('constructPath') || name === 'fill');
};
const agreementResources =
  '<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> /ColorSpace << /CS0 /DeviceRGB >> /ExtGState << /GS0 << /LW 2 >> >> /Shading << /Sh0 << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 1 0] /Function << /FunctionType 2 /Domain [0 1] /C0 [0 0 0] /C1 [1 1 1] /N 1 >> >> >> /XObject << /Im0 5 0 R >> >>';

describe('PDF.js agrees with the inline rules (design decision 5)', () => {
  const clear = 'q BI /W 2 /H 1 /BPC 8 /CS /G ID ab';
  it.each([
    ['EI then the next command', `${clear} EI Q 1 0 0 rg 0 0 9 9 re f`, true],
    ['EI then a tab', `${clear} EI\tQ 1 0 0 rg 0 0 9 9 re f`, false],
    ['EI then a form feed', `${clear} EI\fQ 1 0 0 rg 0 0 9 9 re f`, false],
    ['EI then a NUL', `${clear} EI\x00Q 1 0 0 rg 0 0 9 9 re f`, false],
    ['EI then /', `${clear} EI/F1 12 Tf 1 0 0 rg 0 0 9 9 re f`, false],
    ['a false end in the data', 'q BI /W 4 /H 1 /BPC 8 /CS /G ID xEI 1 EI Q 1 0 0 rg 0 0 9 9 re f', false],
    ['data E then EI', 'q BI /W 1 /H 1 /BPC 8 /CS /G ID EEI Q 1 0 0 rg 0 0 9 9 re f', false],
    ['data aE then EI', 'q BI /W 2 /H 1 /BPC 8 /CS /G ID aEEI Q 1 0 0 rg 0 0 9 9 re f', false],
    ['data EI then EI', 'q BI /W 2 /H 1 /BPC 8 /CS /G ID EIEI Q 1 0 0 rg 0 0 9 9 re f', false],
  ])('%s', async (_, stream, drawn) => {
    const { names } = await operators(stream);
    expect(fillSeen(names)).toBe(drawn);
    // The reader steps over exactly the pictures PDF.js draws as written; every other row is doubt.
    expect(read(stream).kind).toBe(drawn ? 'unchanged' : 'doubt');
  });

  it('a wrong operand count first: PDF.js reads on, the reader says doubt (stricter)', async () => {
    const stream = `${clear} EI 1 Q 1 0 0 rg 0 0 9 9 re f`;
    expect(fillSeen((await operators(stream)).names)).toBe(true);
    expect(read(stream).kind).toBe('doubt');
  });

  it('ASCII85 data then EI glued to a name: the / is skipped and the rest misread', async () => {
    const stream = 'q BI /W 2 /H 1 /BPC 8 /CS /G /F /A85 ID @:F~>EI/F1 12 Tf 1 0 0 rg 0 0 9 9 re f';
    const { names } = await operators(stream);
    const spaced = await operators(stream.replace('~>EI/F1', '~> EI /F1'));
    // Read as written, an extra path is drawn before the font is set: `F1` was taken for `F` and `1`.
    expect(names).not.toEqual(spaced.names);
    expect(names.length).toBe(spaced.names.length + 1);
    expect(read(stream).kind).toBe('doubt');
  });

  it('unknown operators inside BX and EX are split by PDF.js', async () => {
    expect((await operators('BX 1 0 0 rgx EX 0 0 9 9 re f')).names).toContain('setFillRGBColor');
    const glued = (await operators('q 2 w BX Qf EX')).names;
    expect(glued).toContain('restore');
    expect(glued.some((name) => name === 'fill' || name.startsWith('constructPath'))).toBe(true);
    expect(read('BX 1 0 0 rgx EX').kind).toBe('doubt');
    expect(read('BX Qf EX').kind).toBe('doubt');
  });

  /** Operands with each operator's PDF.js count, numbers only, for the operators that take them. */
  const numbersFor = (operator: string) => Array.from({ length: variableOperands.has(operator) ? 3 : operandCounts[operator]! }, () => '0').join(' ');
  const exceptions = new Set(['BI', 'ID', 'EI', 'BX', 'EX', 'd0', 'd1', 'Tj', 'TJ', "'", '"', 'BDC', 'DP', 'sh', 'Do', 'gs', 'Tf', 'cs', 'CS', 'ri', 'BMC', 'MP', 'd']);
  const simple = Object.keys(operandCounts).filter((operator) => !exceptions.has(operator));

  it.each(simple)('%s after a clear inline picture, with its operand count, then a fill', async (operator) => {
    // PDF.js reads on past a command with the wrong count, so a long comment fills the rest of its 75-byte window,
    // and a later false end sits in a string: if PDF.js's look-ahead refused the real EI (a wrong count in the
    // table), it would take that one, and the fill before it would be swallowed as picture data.
    const stream = `q BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI ${numbersFor(operator)} ${operator} %${'c'.repeat(80)}\n1 0 0 rg 0 0 9 9 re f (EI Q 0 0 1 rg) Tj`.replace('  ', ' ');
    expect(fillSeen((await operators(stream)).names)).toBe(true);
    expect(read(stream).kind).not.toBe('doubt');
  });

  it.each([
    ['sh', '/Sh0 sh', 'shadingFill'],
    ['Do', '/Im0 Do', 'paintImageXObject'],
    ['gs', '/GS0 gs', 'setGState'],
    ['Tf', 'BT /F1 12 Tf ET', 'setFont'],
    ['cs', '/CS0 cs 0 0 1 sc', 'setFillRGBColor'],
    ['CS', '/CS0 CS 0 0 1 SC', 'setStrokeRGBColor'],
    ['ri', '/Perceptual ri', 'setRenderingIntent'],
    ['BMC', '/Tag BMC EMC', 'beginMarkedContent'],
    ['MP', '/Tag MP', null],
  ] as [string, string, string | null][])('%s after a clear inline picture: its operator is present after the picture (if PDF.js lists it), nothing taken as data', async (_, command, opName) => {
    const stream = `q BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI ${command} 1 0 0 rg 0 0 9 9 re f`;
    const names = (await operators(stream, agreementResources)).names;
    const after = afterPicture(names);
    if (opName) expect(after).toContain(opName);
    expect(fillSeen(names)).toBe(true);
    expect(read(stream).kind).not.toBe('doubt');
  });

  it.each([
    ['Tj', '(a) Tj'],
    ['TJ', '[(a)] TJ'],
    ["'", "(a) '"],
    ['"', '1 2 (a) "'],
    ['BDC', '/Tag <</MCID 0>> BDC EMC'],
    ['DP', '/Tag <</A 1>> DP'],
    ['d', '[1 2] 0 d'],
  ])('%s right after a picture takes an operand the look-ahead does not accept, so it is doubt there', (_, command) => {
    expect(read(`q BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI ${command}`).kind).toBe('doubt');
    expect(read(`q BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI Q ${command}`).kind).not.toBe('doubt');
  });

  it('BI, BX, EX, d0 and d1 after a picture, each in valid surroundings', async () => {
    const twice = 'q BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI BI /W 2 /H 1 /BPC 8 /CS /G ID cd EI 1 0 0 rg 0 0 9 9 re f';
    expect((await operators(twice)).names.filter((name) => name === 'paintInlineImageXObject').length).toBe(2);
    expect(read(twice).kind).toBe('unchanged');
    for (const command of ['BX EX', 'BX 1 0 0 rg EX']) {
      const stream = `q BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI ${command} 1 0 0 rg 0 0 9 9 re f`;
      expect(fillSeen((await operators(stream)).names)).toBe(true);
      expect(read(stream).kind).not.toBe('doubt');
    }
    // d0 and d1 belong in a Type 3 glyph: read alone, after a picture.
    for (const command of ['1 0 d0', '1 0 0 0 1 1 d1']) expect(read(`BI /W 2 /H 1 /BPC 8 /CS /G ID ab EI ${command} 0 0 9 9 re f`).kind).not.toBe('doubt');
  });
});


// ---------------------------------------------------------------------------
// Every fixture through the reader

type Counts = { pages: number; forms: number; streams: number; edited?: number; unchanged?: number; doubt?: number; 'not-decoded'?: number; 'too-large'?: number };
/** Each fixture's expected counts through the plain copy, `decodeContent` and the test-only editor, or how it fails. A new fixture must be given its own. */
const fixtureCounts: Record<string, Counts | string> = {
  'chinese-unembedded.pdf': { pages: 1, forms: 0, streams: 1, unchanged: 1 },
  'compress-bomb-attachment.pdf': { pages: 1, forms: 0, streams: 1, unchanged: 1 },
  'compress-flate-bomb.pdf': { pages: 1, forms: 0, streams: 1, edited: 1 },
  'compress-jpeg-mismatch.pdf': { pages: 2, forms: 0, streams: 2, edited: 2 },
  'compress-json-bomb.pdf': 'dictionaries over the JSON cap',
  'compress-kinds.pdf': { pages: 7, forms: 0, streams: 7, edited: 7 },
  'compress-lossless.pdf': { pages: 1, forms: 0, streams: 1, edited: 1 },
  'compress-packed.pdf': { pages: 3, forms: 0, streams: 3, unchanged: 3 },
  'compress-password.pdf': { pages: 1, forms: 0, streams: 1, edited: 1 },
  'compress-scans.pdf': { pages: 3, forms: 0, streams: 3, edited: 3 },
  'compress-small-jpg.pdf': { pages: 1, forms: 0, streams: 2, edited: 1, unchanged: 1 },
  'compress-text.pdf': { pages: 3, forms: 0, streams: 3, unchanged: 3 },
  'damaged-cut.pdf': 'qpdf could not read the file.',
  'damaged-xref.pdf': 'qpdf could not read the file.',
  'form.pdf': { pages: 1, forms: 5, streams: 6, edited: 5, unchanged: 1 },
  'images.pdf': { pages: 1, forms: 0, streams: 1, edited: 1 },
  'mixed.pdf': { pages: 4, forms: 0, streams: 4, unchanged: 4 },
  'multilingual.pdf': { pages: 5, forms: 0, streams: 5, edited: 5 },
  'not-a-pdf.pdf': 'qpdf could not read the file.',
  'pages-500.pdf': { pages: 500, forms: 0, streams: 500, unchanged: 500 },
  'password.pdf': { pages: 3, forms: 0, streams: 3, unchanged: 3 },
  'restricted.pdf': { pages: 3, forms: 0, streams: 3, unchanged: 3 },
  'rich.pdf': { pages: 2, forms: 0, streams: 2, unchanged: 2 },
  'scanned.pdf': { pages: 2, forms: 0, streams: 2, edited: 2 },
  'tagged.pdf': { pages: 2, forms: 2, streams: 4, edited: 2, unchanged: 2 },
  'text.pdf': { pages: 3, forms: 0, streams: 3, unchanged: 3 },
  'warning.pdf': { pages: 3, forms: 0, streams: 3, unchanged: 3 },
};
const withPassword = new Set(['password.pdf', 'compress-password.pdf']);

describe('every fixture through the reader', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { dictOf, plainOf, plainStreams } = await import('./content-helpers');
  const dir = join(__dirname, '../fixtures');
  const names = readdirSync(dir).filter((name) => name.endsWith('.pdf')).sort();

  it('every fixture has its expected counts', () => {
    expect(names.filter((name) => !(name in fixtureCounts))).toEqual([]);
  });

  it('a password file without its password gives the plain copy’s own failure', async () => {
    for (const name of withPassword) await expect(plainOf(new Uint8Array(readFileSync(join(dir, name))))).rejects.toThrow('A password did not open the file.');
  });

  it.each(names)('%s', async (name) => {
    const expected = fixtureCounts[name];
    expect(expected, `${name} needs its expected counts in fixtureCounts`).toBeDefined();
    const file = new Uint8Array(readFileSync(join(dir, name)));
    let plain: Uint8Array;
    try {
      plain = await plainOf(file, withPassword.has(name) ? 'open-sesame' : undefined);
    } catch (error) {
      expect((error as Error).message).toBe(expected);
      return;
    }
    let streams: Awaited<ReturnType<typeof plainStreams>>;
    try {
      streams = await plainStreams(plain);
    } catch {
      expect(expected).toBe('dictionaries over the JSON cap');
      return;
    }
    expect(typeof expected).toBe('object');
    // A shared stream is read once, at its strictest place.
    const rank: Record<Place, number> = { 'not-last': 0, last: 1, alone: 2 };
    const places = new Map<string, Place>();
    const place = (id: string, where: Place) => {
      const old = places.get(id);
      if (!old || rank[where] < rank[old]) places.set(id, where);
    };
    for (const page of streams.pages) page.forEach((id, index) => place(id, index === page.length - 1 ? 'last' : 'not-last'));
    for (const id of streams.forms) place(id, 'alone');
    const counts: Counts = { pages: streams.pages.length, forms: streams.forms.length, streams: places.size };
    const budget = recordingBudget();
    for (const [id, where] of places) {
      const decodedStream = decodeContent(streams.raw.get(id)!, dictOf(streams, id), streams.resolve, Inflate, budget);
      const kind = decodedStream.kind === 'decoded' ? editContent(decodedStream.data, testEditor(), where, budget).kind : decodedStream.kind;
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    expect(counts).toEqual(expected);
    expect(budget.calls.every((bytes) => bytes <= maxContentBytes)).toBe(true);
  }, 120_000);
});
