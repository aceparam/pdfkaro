// Reading pictures without decoding them (src/engines/picture.ts): sizes, camera
// turns, the kinds of JPG that are refused, the parts of a JPG that are kept,
// colour profiles, and hostile inputs that must give `damaged`, never a throw.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inflate } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  inflateLimited,
  isHuge,
  jpegForPdf,
  maxPngPixels,
  maxProfileBytes,
  pngDataFits,
  pngDataSize,
  pngForPdf,
  pngProfile,
  profileColourOnly,
  profileFits,
  readOrientation,
  readPicture,
  shownSize,
  type PictureRead,
} from '../../src/engines/picture';

const picture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../fixtures/pictures', name)));
const fflate = { Inflate };
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString('latin1');

const be16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];
const segment = (marker: number, data: number[]) => [0xff, marker, ...be16(data.length + 2), ...data];
/** A JPG made of the given parts between a start and an end of image. */
const jpg = (...parts: number[][]) => new Uint8Array([0xff, 0xd8, ...parts.flat(), 0xff, 0xd9]);
const frame = (marker: number, { precision = 8, width = 16, height = 16, components = 1 } = {}) =>
  segment(marker, [precision, ...be16(height), ...be16(width), components, ...Array.from({ length: components }, (_, index) => [index + 1, 0x11, 0]).flat()]);
const scan = [...segment(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd3, 0x78];

describe('the size, colours and camera turn of a picture', () => {
  const expected: [string, Partial<Extract<PictureRead, { kind: 'ok' }>['picture']>][] = [
    ['tall.jpg', { type: 'jpeg', width: 1500, height: 2000, components: 3, orientation: 1, animated: false }],
    ['wide.jpg', { type: 'jpeg', width: 2000, height: 1500, components: 3 }],
    ['cmyk.jpg', { type: 'jpeg', width: 200, height: 100, components: 4 }],
    ['progressive.jpg', { type: 'jpeg', width: 320, height: 240, components: 3 }],
    ['details.jpg', { type: 'jpeg', width: 400, height: 300, orientation: 1 }],
    ['alpha.png', { type: 'png', width: 240, height: 160, components: 3, animated: false }],
    ['palette.png', { type: 'png', width: 120, height: 80, components: 3 }],
    ['grey16.png', { type: 'png', width: 128, height: 64, components: 1 }],
    ['animated.png', { type: 'png', width: 60, height: 40, animated: true }],
    ['small.png', { type: 'png', width: 300, height: 200 }],
    ['turn-6.png', { type: 'png', width: 100, height: 160, orientation: 6 }],
    ['huge.png', { type: 'png', width: 16_000, height: 16_000, components: 1 }],
  ];
  it.each(expected)('%s', (name, wanted) => {
    const read = readPicture(picture(name));
    expect(read.kind).toBe('ok');
    if (read.kind === 'ok') expect(read.picture).toMatchObject(wanted);
  });

  it('reads the camera turn only before the first scan, as browsers do', () => {
    const exif = (orientation: number) => segment(0xe1, [...Buffer.from('Exif\0\0', 'latin1'), 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
    expect(readPicture(jpg(exif(6), frame(0xc0), scan))).toMatchObject({ kind: 'ok', picture: { orientation: 6 } });
    expect(readPicture(jpg(frame(0xc0), scan, exif(6), scan))).toMatchObject({ kind: 'ok', picture: { orientation: 1 } });
  });

  it('reads every camera turn, 1 to 8, and swaps the shown size for 5 to 8', () => {
    for (let orientation = 1; orientation <= 8; orientation++) {
      const read = readPicture(picture(`turn-${orientation}.jpg`));
      if (read.kind !== 'ok') throw new Error(`turn-${orientation}.jpg was not read`);
      expect(read.picture.orientation).toBe(orientation);
      expect(shownSize(read.picture)).toEqual({ width: 160, height: 100 });
    }
  });

  it('marks only a PNG over 50 million pixels for the notice', () => {
    const huge = readPicture(picture('huge.png'));
    if (huge.kind !== 'ok') throw new Error('huge.png was not read');
    expect(isHuge(huge.picture)).toBe(true);
    expect(isHuge({ ...huge.picture, width: 10_000, height: 5_000 })).toBe(false);
    expect(isHuge({ ...huge.picture, width: 10_000, height: 5_001 })).toBe(true);
    expect(isHuge({ ...huge.picture, type: 'jpeg' })).toBe(false);
    expect(maxPngPixels).toBe(50_000_000);
  });
});

describe('the camera turn in an EXIF block', () => {
  const ifd = (little: boolean, entries: [number, number, number, number][], count = entries.length) => {
    const bytes: number[] = little ? [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0] : [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8];
    const w16 = (value: number) => (little ? [value & 0xff, value >> 8] : be16(value));
    const w32 = (value: number) => (little ? [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24] : [value >>> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
    bytes.push(...w16(count));
    for (const [tag, type, n, value] of entries) bytes.push(...w16(tag), ...w16(type), ...w32(n), ...w16(value), 0, 0);
    bytes.push(0, 0, 0, 0);
    return new Uint8Array(bytes);
  };

  it('reads tag 0x0112 as one SHORT, in either byte order', () => {
    expect(readOrientation(ifd(true, [[0x0112, 3, 1, 6]]))).toBe(6);
    expect(readOrientation(ifd(false, [[0x010f, 2, 1, 0], [0x0112, 3, 1, 8]]))).toBe(8);
  });

  it('gives 1 for anything else: another type, a value out of range, a bad header, an offset outside, a short block', () => {
    expect(readOrientation(ifd(true, [[0x0112, 4, 1, 6]]))).toBe(1);
    expect(readOrientation(ifd(true, [[0x0112, 3, 2, 6]]))).toBe(1);
    expect(readOrientation(ifd(true, [[0x0112, 3, 1, 9]]))).toBe(1);
    expect(readOrientation(ifd(true, [[0x0112, 3, 1, 0]]))).toBe(1);
    expect(readOrientation(new Uint8Array([0x49, 0x49, 0x2a, 0, 0xff, 0xff, 0, 0]))).toBe(1);
    expect(readOrientation(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBe(1);
    expect(readOrientation(new Uint8Array(3))).toBe(1);
    // A directory that claims more entries than it holds.
    expect(readOrientation(ifd(true, [[0x0100, 3, 1, 1], [0x0112, 3, 1, 6]], 5000).subarray(0, 30))).toBe(1);
  });

  it('reads at most 200 entries', () => {
    const many = Array.from({ length: 200 }, (): [number, number, number, number] => [0x0100, 3, 1, 1]);
    expect(readOrientation(ifd(true, [...many, [0x0112, 3, 1, 6]]))).toBe(1);
    expect(readOrientation(ifd(true, [...many.slice(1), [0x0112, 3, 1, 6]]))).toBe(6);
  });
});

describe('the kinds of JPG', () => {
  it('takes baseline, extended and progressive JPGs with 8-bit samples and 1, 3 or 4 colours', () => {
    for (const marker of [0xc0, 0xc1, 0xc2]) {
      for (const components of [1, 3, 4]) {
        expect(readPicture(jpg(frame(marker, { components }), scan)), `${marker.toString(16)} ${components}`).toMatchObject({ kind: 'ok' });
      }
    }
  });

  it('refuses lossless, hierarchical and arithmetic coding, and 12-bit samples, as unsupported', () => {
    for (const marker of [0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]) {
      expect(readPicture(jpg(frame(marker), scan)), marker.toString(16)).toEqual({ kind: 'unsupported' });
    }
    expect(readPicture(jpg(segment(0xde, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]), frame(0xc0), scan))).toEqual({ kind: 'unsupported' });
    expect(readPicture(jpg(frame(0xc0, { precision: 12 }), scan))).toEqual({ kind: 'unsupported' });
    expect(readPicture(jpg(frame(0xc1, { precision: 12 }), scan))).toEqual({ kind: 'unsupported' });
    expect(readPicture(jpg(frame(0xc0, { components: 2 }), scan))).toEqual({ kind: 'unsupported' });
    expect(readPicture(picture('arithmetic.jpg'))).toEqual({ kind: 'unsupported' });
  });

  it('calls damaged a frame with no size, odd samples, two frames, a scan before the frame, no scan or no end', () => {
    expect(readPicture(jpg(frame(0xc0, { height: 0 }), scan))).toEqual({ kind: 'damaged' });
    expect(readPicture(jpg(frame(0xc0, { width: 0 }), scan))).toEqual({ kind: 'damaged' });
    expect(readPicture(jpg(frame(0xc0, { precision: 16 }), scan))).toEqual({ kind: 'damaged' });
    expect(readPicture(jpg(frame(0xc0), frame(0xc0), scan))).toEqual({ kind: 'damaged' });
    expect(readPicture(jpg(scan, frame(0xc0)))).toEqual({ kind: 'damaged' });
    expect(readPicture(jpg(frame(0xc0)))).toEqual({ kind: 'damaged' });
    expect(readPicture(new Uint8Array([0xff, 0xd8, ...frame(0xc0), ...scan]))).toEqual({ kind: 'damaged' });
    expect(readPicture(picture('broken.jpg'))).toEqual({ kind: 'damaged' });
  });

  it('treats FF00 and restart markers inside a scan as data, and fill bytes before a marker as nothing', () => {
    expect(readPicture(jpg(frame(0xc0), scan, [0xff, 0xff], scan))).toMatchObject({ kind: 'ok' });
  });
});

describe('the parts of a JPG kept for the PDF', () => {
  /** The markers of a JPG, in order, up to its first end of image. */
  const markers = (bytes: Uint8Array) => {
    const found: number[] = [];
    let at = 2;
    found.push(0xd8);
    while (at < bytes.length) {
      const marker = bytes[at + 1]!;
      found.push(marker);
      if (marker === 0xd9) break;
      at += 2 + ((bytes[at + 2]! << 8) | bytes[at + 3]!);
      if (marker === 0xda) while (!(bytes[at] === 0xff && bytes[at + 1] !== 0 && !(bytes[at + 1]! >= 0xd0 && bytes[at + 1]! <= 0xd7))) at++;
    }
    return found;
  };
  const kept = new Set([0xd8, 0xdb, 0xc4, 0xcc, 0xdd, 0xc0, 0xc1, 0xc2, 0xda, 0xd9, 0xee]);

  it('keeps only the parts needed to draw it, ends at the first end of image, and keeps frame and scan bytes unchanged', () => {
    for (const name of ['details.jpg', 'details-progressive.jpg', 'tall.jpg', 'cmyk.jpg', 'p3.jpg', 'turn-6.jpg', 'progressive.jpg']) {
      const original = picture(name);
      const cleaned = jpegForPdf(original)!;
      expect(cleaned, name).toBeDefined();
      const found = markers(cleaned.bytes);
      for (const marker of found) expect(kept.has(marker), `${name}: ${marker.toString(16)}`).toBe(true);
      expect(found.at(-1)).toBe(0xd9);
      expect(cleaned.bytes.at(-2)).toBe(0xff);
      expect(cleaned.bytes.at(-1)).toBe(0xd9);
      // Every scan, with its data, is in the cleaned file exactly as in the original, in the same order.
      expect(found.filter((marker) => marker === 0xda).length).toBe(markers(original).filter((marker) => marker === 0xda).length);
      const firstScan = latin1(cleaned.bytes).indexOf('\xff\xda');
      const scansCleaned = latin1(cleaned.bytes).slice(firstScan);
      expect(latin1(original)).toContain(scansCleaned.slice(0, 200));
      // It reads back the same, but with no camera turn, which lived in the EXIF left out.
      const before = readPicture(original);
      const after = readPicture(cleaned.bytes);
      if (before.kind !== 'ok' || after.kind !== 'ok') throw new Error(name);
      expect({ ...after.picture, orientation: before.picture.orientation }).toEqual(before.picture);
      expect(after.picture.orientation).toBe(1);
    }
  });

  it('copies the frame and the whole scan data of a baseline JPG byte for byte', () => {
    const original = picture('tall.jpg');
    const cleaned = jpegForPdf(original)!.bytes;
    const text = latin1(original);
    const sofAt = text.indexOf('\xff\xc0');
    const eoiAt = text.indexOf('\xff\xd9');
    const sos = text.indexOf('\xff\xda');
    expect(latin1(cleaned)).toContain(text.slice(sofAt, sofAt + 19));
    expect(latin1(cleaned).endsWith(text.slice(sos, eoiAt + 2))).toBe(true);
  });

  it('leaves out every detail: EXIF, GPS, XMP, IPTC, comments, thumbnails, other APPn, MPF, the second picture and trailing bytes', () => {
    const original = latin1(picture('details.jpg'));
    for (const marker of ['SECRET-CAMERA-MAKE', 'SECRET-GPS-PLACE', 'SECRET-XMP-TITLE', 'SECRET-XMP-EXTENSION', 'SECRET-IPTC', 'SECRET-COMMENT', 'SECRET-JFIF-THUMB', 'SECRET-JFXX-THUMB', 'SECRET-APP11', 'SECRET-APP15', 'SECRET-MPF-INDEX', 'SECRET-SECOND-GPS', 'SECRET-TRAILING-BYTES']) {
      expect(original, marker).toContain(marker);
    }
    const cleaned = latin1(jpegForPdf(picture('details.jpg'))!.bytes);
    expect(cleaned).not.toContain('SECRET');
    expect(cleaned).not.toContain('Exif');
    expect(cleaned).not.toContain('JFIF');
    expect(cleaned.indexOf('\xff\xd9')).toBe(cleaned.length - 2);
    expect(latin1(jpegForPdf(picture('details-progressive.jpg'))!.bytes)).not.toContain('SECRET-BETWEEN-SCANS');
  });

  it('keeps an Adobe segment as its standard 12-byte body only, whatever length it claims', () => {
    const body = [...Buffer.from('Adobe', 'latin1'), 0, 100, 0, 0, 0, 0, 2];
    const padded = jpg(segment(0xee, [...body, ...Buffer.from('SECRET-IN-ADOBE', 'latin1')]), frame(0xc0, { components: 4 }), scan);
    const cleaned = jpegForPdf(padded)!;
    expect(cleaned.adobe).toBe(true);
    const text = latin1(cleaned.bytes);
    expect(text).not.toContain('SECRET');
    const at = text.indexOf('\xff\xee');
    expect([...cleaned.bytes.subarray(at, at + 16)]).toEqual([0xff, 0xee, 0, 14, ...body]);
    // One too short to hold the body is left out.
    const short = jpegForPdf(jpg(segment(0xee, [...Buffer.from('Adobe', 'latin1'), 0, 100]), frame(0xc0, { components: 4 }), scan))!;
    expect(short.adobe).toBe(false);
    expect(latin1(short.bytes)).not.toContain('Adobe');
    // The fixture's own segment is already the standard length, so it is kept as it was.
    const cmyk = picture('cmyk.jpg');
    const own = latin1(cmyk).indexOf('\xff\xeeAdobe'.slice(0, 2));
    expect(latin1(jpegForPdf(cmyk)!.bytes)).toContain(latin1(cmyk.subarray(own, own + 16)));
  });

  it('says whether an Adobe segment is there', () => {
    expect(jpegForPdf(picture('cmyk.jpg'))!.adobe).toBe(true);
    expect(jpegForPdf(picture('tall.jpg'))!.adobe).toBe(false);
  });

  it('gives nothing for a JPG that is not passed', () => {
    expect(jpegForPdf(picture('broken.jpg'))).toBeUndefined();
    expect(jpegForPdf(picture('arithmetic.jpg'))).toBeUndefined();
  });
});

describe('colour profiles', () => {
  const p3 = picture('p3.icc');
  const profileJpg = (chunks: number[][], components = 3) => jpg(...chunks.map((data) => segment(0xe2, data)), frame(0xc0, { components }), scan);
  const chunk = (sequence: number, total: number, data: Uint8Array) => [...Buffer.from('ICC_PROFILE\0', 'latin1'), sequence, total, ...data];

  it('joins a profile split over two chunks, in sequence order', () => {
    expect(jpegForPdf(picture('p3.jpg'))!.profile).toEqual(p3);
    const half = Math.ceil(p3.length / 2);
    const reversed = profileJpg([chunk(2, 2, p3.subarray(half)), chunk(1, 2, p3.subarray(0, half))]);
    expect(jpegForPdf(reversed)!.profile).toEqual(p3);
  });

  it('keeps none when a chunk is missing or repeated, the counts disagree, or the profile does not fit', () => {
    const half = Math.ceil(p3.length / 2);
    expect(jpegForPdf(profileJpg([chunk(1, 2, p3.subarray(0, half))]))!.profile).toBeUndefined();
    expect(jpegForPdf(profileJpg([chunk(1, 2, p3.subarray(0, half)), chunk(1, 2, p3.subarray(half))]))!.profile).toBeUndefined();
    expect(jpegForPdf(profileJpg([chunk(1, 2, p3.subarray(0, half)), chunk(2, 3, p3.subarray(half))]))!.profile).toBeUndefined();
    expect(jpegForPdf(profileJpg([chunk(1, 0, p3)]))!.profile).toBeUndefined();
    // An RGB profile in a grey or CMYK JPG.
    expect(jpegForPdf(profileJpg([chunk(1, 1, p3)], 1))!.profile).toBeUndefined();
    expect(jpegForPdf(profileJpg([chunk(1, 1, p3)], 4))!.profile).toBeUndefined();
    // Its own size disagrees with its bytes.
    expect(jpegForPdf(picture('bad-profile.jpg'))!.profile).toBeUndefined();
  });

  it('keeps none over 4 MB', () => {
    const big = new Uint8Array(maxProfileBytes + 4);
    big.set(p3.subarray(0, 128));
    new DataView(big.buffer).setUint32(0, big.length);
    expect(profileFits(big, 3)).toBe(false);
    const parts = Array.from({ length: 70 }, (_, index) => chunk(index + 1, 70, big.subarray(index * 60_000, (index + 1) * 60_000)));
    expect(jpegForPdf(profileJpg(parts))!.profile).toBeUndefined();
  });

  it('checks the class, the signature and the colour space', () => {
    expect(profileFits(p3, 3)).toBe(true);
    expect(profileFits(p3, 1)).toBe(false);
    const link = Uint8Array.from(p3);
    link.set(Buffer.from('link', 'latin1'), 12);
    expect(profileFits(link, 3)).toBe(false);
    const unsigned = Uint8Array.from(p3);
    unsigned.set(Buffer.from('xxxx', 'latin1'), 36);
    expect(profileFits(unsigned, 3)).toBe(false);
    expect(profileFits(p3.subarray(0, 100), 3)).toBe(false);
  });

  it('reads a PNG profile, inflated with limits, only when it is RGB', () => {
    expect(pngProfile(picture('profile.png'), fflate)).toEqual(p3);
    expect(pngProfile(picture('bad-profile.png'), fflate)).toBeUndefined();
    expect(pngProfile(picture('bomb-profile.png'), fflate)).toBeUndefined();
    expect(pngProfile(picture('grey-profile.png'), fflate)).toBeUndefined();
    expect(pngProfile(picture('small.png'), fflate)).toBeUndefined();
    // An RGB profile in a grey or grey-and-alpha PNG is left out by its colour type.
    const grey = Uint8Array.from(picture('profile.png'));
    for (const type of [0, 4]) {
      grey[25] = type;
      grey[24] = 8;
      expect(pngProfile(grey, fflate), `colour type ${type}`).toBeUndefined();
    }
  });

  it('stops inflating as soon as the output passes the limit', async () => {
    const { deflateSync } = await import('node:zlib');
    const data = new Uint8Array(deflateSync(Buffer.alloc(50 * 1024 * 1024), { level: 9 })).subarray(2);
    let largest = 0;
    class Counting extends Inflate {
      constructor(ondata: (chunk: Uint8Array, final: boolean) => void) {
        super((chunk, final) => {
          largest = Math.max(largest, chunk.length);
          ondata(chunk, final);
        });
      }
    }
    expect(inflateLimited(data, Counting, maxProfileBytes)).toBeUndefined();
    // No one piece of output came near the 50 MB the data would make.
    expect(largest).toBeLessThan(2 * 1024 * 1024);
    expect(inflateLimited(new Uint8Array(deflateSync(Buffer.from('hello'))).subarray(2), Inflate, 100)).toEqual(new TextEncoder().encode('hello'));
    expect(inflateLimited(new Uint8Array([1, 2, 3]), Inflate, 100)).toBeUndefined();
  });
});

describe('only the colour data of a profile', () => {
  const p3 = picture('p3.icc');
  const tagsOf = (profile: Uint8Array) => {
    const view = new DataView(profile.buffer, profile.byteOffset, profile.byteLength);
    return Array.from({ length: view.getUint32(128) }, (_, index) => {
      const at = 132 + index * 12;
      const offset = view.getUint32(at + 4);
      const size = view.getUint32(at + 8);
      return { signature: latin1(profile.subarray(at, at + 4)), offset, size, data: profile.subarray(offset, offset + size) };
    });
  };

  it('keeps the colour tags byte for byte, writes a plain description and an empty copyright, and drops the rest', () => {
    const clean = profileColourOnly(p3)!;
    const before = new Map(tagsOf(p3).map((tag) => [tag.signature, tag]));
    const after = tagsOf(clean);
    expect(after.map((tag) => tag.signature).sort()).toEqual(['bTRC', 'bXYZ', 'chad', 'cprt', 'desc', 'gTRC', 'gXYZ', 'rTRC', 'rXYZ', 'wtpt']);
    for (const tag of after) {
      if (tag.signature === 'desc' || tag.signature === 'cprt') continue;
      expect(Buffer.from(tag.data).equals(Buffer.from(before.get(tag.signature)!.data)), tag.signature).toBe(true);
    }
    // Tags that shared one block still share it.
    const trc = after.filter((tag) => tag.signature.endsWith('TRC'));
    expect(new Set(trc.map((tag) => tag.offset)).size).toBe(1);
    expect(latin1(after.find((tag) => tag.signature === 'desc')!.data)).toContain('C\0o\0l\0o\0u\0r\0 \0p\0r\0o\0f\0i\0l\0e');
    expect(latin1(after.find((tag) => tag.signature === 'desc')!.data).startsWith('mluc')).toBe(true);
    expect(latin1(clean)).not.toMatch(/SECRET|SMKR|SMDL|SCRT/);
  });

  it('clears the preferred CMM, date, platform, device, attributes, creator and profile ID, and sets the new size', () => {
    expect(latin1(p3.subarray(4, 8))).toBe('SCMM');
    expect(latin1(p3.subarray(40, 44))).toBe('APPL');
    const clean = profileColourOnly(p3)!;
    const view = new DataView(clean.buffer, clean.byteOffset, clean.byteLength);
    expect(view.getUint32(0)).toBe(clean.length);
    expect([...clean.subarray(4, 8)].every((byte) => byte === 0)).toBe(true);
    expect([...clean.subarray(40, 44)].every((byte) => byte === 0)).toBe(true);
    expect([...clean.subarray(24, 36)].every((byte) => byte === 0)).toBe(true);
    expect([...clean.subarray(48, 64)].every((byte) => byte === 0)).toBe(true);
    expect([...clean.subarray(80, 128)].every((byte) => byte === 0)).toBe(true);
    expect(latin1(clean)).not.toMatch(/SCMM|APPL/);
    // The rest of the header is kept: version, class, colour space, signature and white point.
    expect(Buffer.from(clean.subarray(8, 24)).equals(Buffer.from(p3.subarray(8, 24)))).toBe(true);
    expect(latin1(clean.subarray(36, 40))).toBe('acsp');
    expect(Buffer.from(clean.subarray(68, 80)).equals(Buffer.from(p3.subarray(68, 80)))).toBe(true);
    expect(profileFits(clean, 3)).toBe(true);
  });

  it('gives nothing when the colour data would come to more than 4 MB, as tags pointing into one another could make it', () => {
    // A 3 MB profile whose three curves point at three overlapping blocks of nearly all of it: copied once each, 9 MB.
    const size = 3 * 1024 * 1024;
    const big = new Uint8Array(size);
    big.set(p3.subarray(0, 128));
    const view = new DataView(big.buffer);
    view.setUint32(0, size);
    view.setUint32(128, 3);
    ['rTRC', 'gTRC', 'bTRC'].forEach((signature, index) => {
      big.set(Buffer.from(signature, 'latin1'), 132 + index * 12);
      view.setUint32(132 + index * 12 + 4, 200 + index * 4);
      view.setUint32(132 + index * 12 + 8, size - 300);
    });
    expect(profileFits(big, 3)).toBe(true);
    expect(profileColourOnly(big)).toBeUndefined();
  });

  it('writes the version 2 text types for a version 2 profile', () => {
    const v2 = Uint8Array.from(p3);
    v2[8] = 2;
    v2[9] = 0x10;
    const tags = tagsOf(profileColourOnly(v2)!);
    expect(latin1(tags.find((tag) => tag.signature === 'desc')!.data).startsWith('desc')).toBe(true);
    expect(latin1(tags.find((tag) => tag.signature === 'desc')!.data)).toContain('Colour profile\0');
    expect(latin1(tags.find((tag) => tag.signature === 'cprt')!.data).startsWith('text')).toBe(true);
  });

  it('gives nothing for a profile with no colour tags, or one that cannot be read', () => {
    const noColour = Uint8Array.from(p3);
    const view = new DataView(noColour.buffer);
    for (let index = 0; index < view.getUint32(128); index++) noColour.set(Buffer.from('zzzz', 'latin1'), 132 + index * 12);
    expect(profileColourOnly(noColour)).toBeUndefined();
    const tooMany = Uint8Array.from(p3);
    new DataView(tooMany.buffer).setUint32(128, 100_000);
    expect(profileColourOnly(tooMany)).toBeUndefined();
    expect(profileColourOnly(p3.subarray(0, 100))).toBeUndefined();
    // A tag whose block runs past the end is left out, and the rest kept.
    const pastEnd = Uint8Array.from(p3);
    const rXYZ = tagsOf(p3).findIndex((tag) => tag.signature === 'rXYZ');
    new DataView(pastEnd.buffer).setUint32(132 + rXYZ * 12 + 4, p3.length - 4);
    expect(tagsOf(profileColourOnly(pastEnd)!).map((tag) => tag.signature)).not.toContain('rXYZ');
  });
});

describe('the PNG pdf-lib is given', () => {
  /** The chunk types of a PNG, in order. */
  const chunkTypes = (bytes: Uint8Array) => {
    const types: string[] = [];
    for (let at = 8; at + 8 <= bytes.length; ) {
      const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(at);
      types.push(latin1(bytes.subarray(at + 4, at + 8)));
      at += 12 + length;
    }
    return types;
  };

  it('holds only IHDR, PLTE, tRNS, IDAT and IEND', () => {
    for (const name of ['details.png', 'profile.png', 'animated.png', 'palette.png', 'alpha.png', 'turn-6.png', 'text-bomb.png', 'bomb-profile.png']) {
      const types = chunkTypes(pngForPdf(picture(name))!);
      expect(types[0], name).toBe('IHDR');
      expect(types.at(-1), name).toBe('IEND');
      for (const type of types) expect(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'], `${name}: ${type}`).toContain(type);
    }
    expect(latin1(pngForPdf(picture('details.png'))!)).not.toContain('SECRET');
    expect(chunkTypes(pngForPdf(picture('palette.png'))!)).toEqual(['IHDR', 'PLTE', 'IDAT', 'IEND']);
  });

  it('gives an animated PNG its default picture only', () => {
    const first = pngForPdf(picture('animated.png'))!;
    expect(latin1(first)).not.toMatch(/acTL|fcTL|fdAT/);
    expect(readPicture(first)).toMatchObject({ kind: 'ok', picture: { width: 60, height: 40, animated: false } });
  });

  it('gives nothing for a PNG that is not passed', () => {
    expect(pngForPdf(picture('broken.png'))).toBeUndefined();
    expect(pngForPdf(picture('tall.jpg'))).toBeUndefined();
  });
});

describe("a PNG's image data, counted against its header", () => {
  it('works out the size from the header, with Adam7 passes when interlaced', () => {
    expect(pngDataSize(1, 1, 2, 8, false)).toBe(4);
    expect(pngDataSize(300, 200, 6, 8, false)).toBe((300 * 4 + 1) * 200);
    expect(pngDataSize(10, 3, 0, 1, false)).toBe((2 + 1) * 3);
    expect(pngDataSize(128, 64, 0, 16, false)).toBe((256 + 1) * 64);
    // 1 by 1 interlaced: only the first pass holds a pixel.
    expect(pngDataSize(1, 1, 2, 8, true)).toBe(4);
    // 8 by 8 RGB interlaced: passes of 1x1, 1x1, 2x1, 2x2, 4x2, 4x4, 8x4 pixels.
    const rows = (w: number, h: number) => (w * 3 + 1) * h;
    expect(pngDataSize(8, 8, 2, 8, true)).toBe(rows(1, 1) + rows(1, 1) + rows(2, 1) + rows(2, 2) + rows(4, 2) + rows(4, 4) + rows(8, 4));
  });

  it('passes every good PNG in the test set, interlaced too', async () => {
    for (const name of ['alpha.png', 'palette.png', 'grey16.png', 'animated.png', 'details.png', 'profile.png', 'small.png', 'screenshot.png', 'turn-6.png', 'grey-profile.png', 'bomb-profile.png', 'text-bomb.png']) {
      expect(pngDataFits(picture(name), fflate), name).toBe(true);
    }
    const { deflateSync } = await import('node:zlib');
    const png = Uint8Array.from(picture('small.png'));
    // An interlaced 8 by 8 RGB picture with exactly its data.
    const rows = (w: number, h: number) => (w * 3 + 1) * h;
    const data = deflateSync(Buffer.alloc(rows(1, 1) * 2 + rows(2, 1) + rows(2, 2) + rows(4, 2) + rows(4, 4) + rows(8, 4)));
    const chunk = (type: string, body: Uint8Array) => {
      const out = new Uint8Array(12 + body.length);
      new DataView(out.buffer).setUint32(0, body.length);
      out.set(Buffer.from(type, 'latin1'), 4);
      out.set(body, 8);
      return out;
    };
    const interlaced = new Uint8Array([...png.subarray(0, 8), ...chunk('IHDR', new Uint8Array([0, 0, 0, 8, 0, 0, 0, 8, 8, 2, 0, 0, 1])), ...chunk('IDAT', data), ...chunk('IEND', new Uint8Array(0))]);
    expect(readPicture(interlaced)).toMatchObject({ kind: 'ok' });
    expect(pngDataFits(interlaced, fflate)).toBe(true);
  });

  it('refuses image data that inflates past the header, counting without keeping it and stopping early', () => {
    let pushed = 0;
    class Counting extends Inflate {
      push(chunk: Uint8Array, final?: boolean) {
        pushed += chunk.length;
        super.push(chunk, final);
      }
    }
    const bomb = picture('data-bomb.png');
    expect(readPicture(bomb)).toMatchObject({ kind: 'ok', picture: { width: 1, height: 1 } });
    expect(pngDataFits(bomb, { Inflate: Counting })).toBe(false);
    // It stopped after the first few kilobytes, not after reading all 20 KB of data (20 MB inflated).
    expect(pushed).toBeLessThan(4096);
  });

  it('refuses image data that is not zlib, or does not inflate', () => {
    const broken = Uint8Array.from(picture('small.png'));
    const idat = latin1(broken).indexOf('IDAT') + 4;
    broken[idat] = 0x00;
    expect(pngDataFits(broken, fflate)).toBe(false);
    const garbled = Uint8Array.from(picture('small.png'));
    garbled.fill(0xff, idat + 2, idat + 40);
    expect(pngDataFits(garbled, fflate)).toBe(false);
    expect(pngDataFits(picture('broken.png'), fflate)).toBe(false);
  });
});

describe('hostile pictures', () => {
  const tryAll = (bytes: Uint8Array) => {
    const read = readPicture(bytes);
    expect(['ok', 'damaged', 'unsupported']).toContain(read.kind);
    jpegForPdf(bytes);
    pngForPdf(bytes);
    pngDataFits(bytes, fflate);
    pngProfile(bytes, fflate);
    return read;
  };

  it('calls every cut-off picture damaged, never throwing', () => {
    for (const name of ['turn-6.jpg', 'details.jpg', 'p3.jpg', 'details-progressive.jpg', 'details.png', 'profile.png', 'animated.png', 'palette.png']) {
      const whole = picture(name);
      for (let length = 0; length < whole.length; length++) {
        const read = tryAll(whole.subarray(0, length));
        // A JPG cut inside its trailing details still ends at its first end of image, so it is whole.
        if (read.kind === 'ok') expect(name === 'details.jpg' && length > latin1(whole).indexOf('\xff\xd9')).toBe(true);
      }
    }
  });

  it('calls empty, zero-size and unknown files damaged', () => {
    expect(readPicture(new Uint8Array(0))).toEqual({ kind: 'damaged' });
    expect(readPicture(picture('zero-size.png'))).toEqual({ kind: 'damaged' });
    expect(readPicture(new TextEncoder().encode('%PDF-1.7 not a picture'))).toEqual({ kind: 'damaged' });
    expect(readPicture(picture('broken.png'))).toEqual({ kind: 'damaged' });
  });

  it('calls a length past the end damaged, in a JPG or a PNG', () => {
    expect(readPicture(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2]))).toEqual({ kind: 'damaged' });
    const png = Uint8Array.from(picture('small.png'));
    new DataView(png.buffer).setUint32(33, 0x7fffffff);
    expect(readPicture(png)).toEqual({ kind: 'damaged' });
  });

  it('stops walking a JPG of too many segments, or a PNG of too many chunks', () => {
    const many = jpg(...Array.from({ length: 70_000 }, () => segment(0xfe, [])), frame(0xc0), scan);
    expect(readPicture(many)).toEqual({ kind: 'damaged' });
    const small = picture('small.png');
    const iend = latin1(small).lastIndexOf('IEND') - 4;
    const empty = [0, 0, 0, 0, ...Buffer.from('tEXt', 'latin1'), 0, 0, 0, 0];
    const chunks = new Uint8Array(100_001 * 12);
    for (let index = 0; index < 100_001; index++) chunks.set(empty, index * 12);
    const crowded = new Uint8Array([...small.subarray(0, iend), ...chunks, ...small.subarray(iend)]);
    expect(readPicture(crowded)).toEqual({ kind: 'damaged' });
  });

  it('survives random bytes after a valid start', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed & 0xff;
    };
    const starts = [picture('turn-1.jpg').subarray(0, 40), picture('small.png').subarray(0, 33), new Uint8Array([0xff, 0xd8, 0xff])];
    for (let round = 0; round < 3000; round++) {
      const start = starts[round % starts.length]!;
      const bytes = new Uint8Array(start.length + 1 + (random() % 200));
      bytes.set(start);
      for (let at = start.length; at < bytes.length; at++) bytes[at] = random();
      tryAll(bytes);
    }
  });
});
