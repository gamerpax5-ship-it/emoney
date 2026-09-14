(() => {
  'use strict';

  // Small byte-mode QR renderer for public addresses and otpauth URIs.
  // Version 3-L is sufficient for the values used by this app.
  let config = { size: 29, ecc: 15, data: 55, alignment: 22 };

  function multiply(a, b) {
    let result = 0;
    while (b) {
      if (b & 1) result ^= a;
      b >>>= 1;
      a = (a << 1) ^ ((a & 0x80) ? 0x11d : 0);
    }
    return result;
  }

  function generator() {
    let polynomial = [1];
    let root = 1;
    for (let i = 0; i < config.ecc; i += 1) {
      const next = new Array(polynomial.length + 1).fill(0);
      for (let j = 0; j < polynomial.length; j += 1) {
        next[j] ^= polynomial[j];
        next[j + 1] ^= multiply(polynomial[j], root);
      }
      polynomial = next;
      root = (root << 1) ^ ((root & 0x80) ? 0x11d : 0);
    }
    return polynomial;
  }

  function errorCorrection(data) {
    const generatorPolynomial = generator();
    const remainder = new Array(config.ecc).fill(0);
    for (const byte of data) {
      const factor = byte ^ remainder[0];
      remainder.shift();
      remainder.push(0);
      for (let i = 0; i < config.ecc; i += 1) remainder[i] ^= multiply(generatorPolynomial[i + 1], factor);
    }
    return remainder;
  }

  function bitsToBytes(bytes) {
    const bits = [];
    const push = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, 8);
    bytes.forEach(byte => push(byte, 8));
    push(0, Math.min(4, config.data * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    const result = [];
    for (let i = 0; i < bits.length; i += 8) result.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
    for (let pad = 0xec; result.length < config.data; pad ^= 0xfd) result.push(pad);
    return result;
  }

  function bch(value, polynomial) {
    let valueBits = 0;
    for (let v = value; v; v >>>= 1) valueBits += 1;
    let polynomialBits = 0;
    for (let v = polynomial; v; v >>>= 1) polynomialBits += 1;
    value <<= polynomialBits - 1;
    while (valueBits >= polynomialBits) {
      value ^= polynomial << (valueBits - polynomialBits);
      while (valueBits && !(value & (1 << (valueBits - 1)))) valueBits -= 1;
    }
    return value;
  }

  function formatBits(mask) {
    const data = (1 << 3) | mask; // error correction level L
    return ((data << 10) | bch(data, 0x537)) ^ 0x5412;
  }

  function drawFinder(matrix, top, left) {
    for (let y = -1; y <= 7; y += 1) for (let x = -1; x <= 7; x += 1) {
      const row = top + y; const col = left + x;
      if (row < 0 || row >= config.size || col < 0 || col >= config.size) continue;
      matrix[row][col] = y >= 0 && y <= 6 && x >= 0 && x <= 6 && (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4));
    }
  }

  function baseMatrix() {
    const matrix = Array.from({ length: config.size }, () => new Array(config.size).fill(null));
    drawFinder(matrix, 0, 0); drawFinder(matrix, 0, config.size - 7); drawFinder(matrix, config.size - 7, 0);
    for (let i = 8; i < config.size - 8; i += 1) {
      if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
      if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
    }
    for (let y = -2; y <= 2; y += 1) for (let x = -2; x <= 2; x += 1) {
      const row = config.alignment + y; const col = config.alignment + x;
      if (matrix[row][col] === null) matrix[row][col] = Math.max(Math.abs(x), Math.abs(y)) !== 1;
    }
    const format = formatBits(0);
    for (let i = 0; i < 15; i += 1) {
      const a = i < 6 ? i : i < 8 ? i + 1 : config.size - 15 + i;
      const b = i < 8 ? config.size - i - 1 : i < 9 ? 15 - i : 14 - i;
      matrix[a][8] = null;
      matrix[8][b] = null;
    }
    matrix[config.size - 8][8] = true;
    return matrix;
  }

  function applyFormat(matrix, mask) {
    const format = formatBits(mask);
    for (let i = 0; i < 15; i += 1) {
      const bit = ((format >>> i) & 1) !== 0;
      const a = i < 6 ? i : i < 8 ? i + 1 : config.size - 15 + i;
      const b = i < 8 ? config.size - i - 1 : i < 9 ? 15 - i : 14 - i;
      matrix[a][8] = bit;
      matrix[8][b] = bit;
    }
    matrix[config.size - 8][8] = true;
  }

  function maskBit(mask, row, col) {
    return [
      (row + col) % 2 === 0, row % 2 === 0, col % 3 === 0, (row + col) % 3 === 0,
      (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
      (row * col) % 2 + (row * col) % 3 === 0,
      ((row * col) % 2 + (row * col) % 3) % 2 === 0,
      ((row * col) % 3 + (row + col) % 2) % 2 === 0
    ][mask];
  }

  function placeData(matrix, codewords, mask) {
    let bitIndex = 0; let upward = true;
    for (let right = config.size - 1; right >= 1; right -= 2) {
      if (right === 6) right -= 1;
      for (let step = 0; step < config.size; step += 1) {
        const row = upward ? config.size - 1 - step : step;
        for (let offset = 0; offset < 2; offset += 1) {
          const col = right - offset;
          if (matrix[row][col] !== null) continue;
          const bit = bitIndex < codewords.length * 8 && ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
          matrix[row][col] = bit !== maskBit(mask, row, col);
          bitIndex += 1;
        }
      }
      upward = !upward;
    }
  }

  function penalty(matrix) {
    let score = 0;
    const run = line => { let count = 1; for (let i = 1; i < line.length; i += 1) { if (line[i] === line[i - 1]) count += 1; else { if (count >= 5) score += count - 2; count = 1; } } if (count >= 5) score += count - 2; };
    for (let i = 0; i < config.size; i += 1) { run(matrix[i]); run(matrix.map(row => row[i])); }
    for (let y = 0; y < config.size - 1; y += 1) for (let x = 0; x < config.size - 1; x += 1) if (matrix[y][x] === matrix[y + 1][x] && matrix[y][x] === matrix[y][x + 1] && matrix[y][x] === matrix[y + 1][x + 1]) score += 3;
    let dark = 0; matrix.forEach(row => row.forEach(value => { if (value) dark += 1; }));
    score += Math.abs(100 * dark / (config.size * config.size) - 50) * 2;
    return score;
  }

  function encode(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    config = bytes.length <= 41 ? { size: 29, ecc: 15, data: 55, alignment: 22 } : bytes.length <= 70 ? { size: 33, ecc: 20, data: 80, alignment: 26 } : { size: 37, ecc: 26, data: 108, alignment: 30 };
    if (bytes.length > 95) throw new Error('QR value is too long');
    const data = bitsToBytes(bytes);
    const codewords = data.concat(errorCorrection(data));
    let best = null; let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask += 1) {
      const matrix = baseMatrix(); applyFormat(matrix, mask); placeData(matrix, codewords, mask);
      const score = penalty(matrix); if (score < bestScore) { bestScore = score; best = matrix; }
    }
    return best;
  }

  function render(canvas, text) {
    const matrix = encode(text); const quiet = 4; const cells = config.size + quiet * 2; const context = canvas.getContext('2d');
    const size = Math.max(128, Number(canvas.dataset.size || 176)); canvas.width = size; canvas.height = size; context.fillStyle = '#fff'; context.fillRect(0, 0, size, size); context.fillStyle = '#111';
    for (let y = 0; y < config.size; y += 1) for (let x = 0; x < config.size; x += 1) if (matrix[y][x]) context.fillRect(Math.round((x + quiet) * size / cells), Math.round((y + quiet) * size / cells), Math.ceil(size / cells), Math.ceil(size / cells));
  }

  window.digiQr = { render };
})();
