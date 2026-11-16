// Raw picture samples, made smaller without loss of what is kept: PNG
// predictors undone, then 8-bit grey or RGB samples scaled down by area
// averaging. Compress PDF uses it for pictures stored with /FlateDecode. A pure
// module: no page, no library, no network.

/**
 * Undoes PNG predictors (a PDF's /Predictor 10 to 15): each row of `width`
 * pixels of `components` 8-bit samples starts with its own filter byte, 0 to 4.
 * Gives the samples alone, or undefined when the data is not the expected size
 * or a row's filter byte is not one of the five.
 */
export function unpredict(data: Uint8Array, width: number, height: number, components: number): Uint8Array | undefined {
  const stride = width * components;
  if (data.length !== (stride + 1) * height) return undefined;
  const out = new Uint8Array(stride * height);
  const bpp = components;
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)]!;
    const from = y * (stride + 1) + 1;
    const row = y * stride;
    const above = row - stride;
    switch (filter) {
      case 0:
        out.set(data.subarray(from, from + stride), row);
        break;
      case 1:
        for (let x = 0; x < stride; x++) out[row + x] = (data[from + x]! + (x >= bpp ? out[row + x - bpp]! : 0)) & 0xff;
        break;
      case 2:
        for (let x = 0; x < stride; x++) out[row + x] = (data[from + x]! + (y > 0 ? out[above + x]! : 0)) & 0xff;
        break;
      case 3:
        for (let x = 0; x < stride; x++) {
          const left = x >= bpp ? out[row + x - bpp]! : 0;
          const up = y > 0 ? out[above + x]! : 0;
          out[row + x] = (data[from + x]! + ((left + up) >> 1)) & 0xff;
        }
        break;
      case 4:
        for (let x = 0; x < stride; x++) {
          const a = x >= bpp ? out[row + x - bpp]! : 0;
          const b = y > 0 ? out[above + x]! : 0;
          const c = x >= bpp && y > 0 ? out[above + x - bpp]! : 0;
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          out[row + x] = (data[from + x]! + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
        }
        break;
      default:
        return undefined;
    }
  }
  return out;
}

/**
 * For each source position along one side, the output position it falls in
 * and its share of it, and the share of the next one when it straddles the
 * edge between two. Scaling down only, so a source position touches at most two.
 */
function shares(from: number, to: number): { index: Int32Array; first: Float64Array; second: Float64Array } {
  const scale = from / to;
  const index = new Int32Array(from);
  const first = new Float64Array(from);
  const second = new Float64Array(from);
  for (let i = 0; i < from; i++) {
    const o = Math.min(to - 1, Math.floor(i / scale));
    const edge = (o + 1) * scale;
    index[i] = o;
    if (i + 1 <= edge || o === to - 1) {
      first[i] = 1 / scale;
    } else {
      first[i] = (edge - i) / scale;
      second[i] = (i + 1 - edge) / scale;
    }
  }
  return { index, first, second };
}

/**
 * Scales 8-bit samples of `components` per pixel down to `toWidth` by
 * `toHeight` by area averaging: each new pixel is the average of the source
 * area it covers. Rows are read once, in order, so only two rows of sums are
 * held besides the input and the output. Never scales up.
 */
export function scaleDown(samples: Uint8Array, width: number, height: number, components: number, toWidth: number, toHeight: number): Uint8Array {
  if (samples.length !== width * height * components) throw new Error('The samples are not the size given.');
  if (toWidth < 1 || toHeight < 1 || toWidth > width || toHeight > height) throw new Error('The new size is not smaller.');
  const across = shares(width, toWidth);
  const down = shares(height, toHeight);
  const outStride = toWidth * components;
  const out = new Uint8Array(outStride * toHeight);
  const narrow = new Float64Array(outStride);
  let current = new Float64Array(outStride);
  let next = new Float64Array(outStride);
  let currentRow = 0;
  const flush = (sums: Float64Array, row: number) => {
    const at = row * outStride;
    for (let x = 0; x < outStride; x++) out[at + x] = Math.min(255, Math.max(0, Math.round(sums[x]!)));
  };
  for (let y = 0; y < height; y++) {
    // The source row made narrow.
    narrow.fill(0);
    const from = y * width * components;
    for (let x = 0; x < width; x++) {
      const o = across.index[x]! * components;
      const a = across.first[x]!;
      const b = across.second[x]!;
      for (let c = 0; c < components; c++) {
        const value = samples[from + x * components + c]!;
        narrow[o + c]! += value * a;
        if (b > 0) narrow[o + components + c]! += value * b;
      }
    }
    // Added to the one or two new rows it falls in.
    const o = down.index[y]!;
    while (currentRow < o) {
      flush(current, currentRow);
      [current, next] = [next, current];
      next.fill(0);
      currentRow++;
    }
    const a = down.first[y]!;
    const b = down.second[y]!;
    for (let x = 0; x < outStride; x++) {
      current[x]! += narrow[x]! * a;
      if (b > 0) next[x]! += narrow[x]! * b;
    }
  }
  flush(current, currentRow);
  return out;
}

/** The size a picture of `width` by `height` is scaled to so its longer side is `limit`, never below 1 pixel. */
export function fittedSize(width: number, height: number, limit: number): { width: number; height: number } {
  const scale = limit / Math.max(width, height);
  return { width: Math.max(1, Math.min(width, Math.round(width * scale))), height: Math.max(1, Math.min(height, Math.round(height * scale))) };
}
