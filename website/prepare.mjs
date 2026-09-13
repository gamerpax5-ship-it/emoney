import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const root = fileURLToPath(new URL('.', import.meta.url));
const packedPath = join(root, 'index.html.br.b64');
const outputPath = join(root, 'index.html');

const encoded = (await readFile(packedPath, 'utf8')).trim();
if (!encoded) throw new Error('LOKTRON website bundle is empty');

const html = brotliDecompressSync(Buffer.from(encoded, 'base64'));
const source = html.toString('utf8');

for (const marker of ['LOKTRON', 'Buy USDT']) {
  if (!source.includes(marker)) throw new Error(`Website verification failed: missing ${marker}`);
}
if (!/^\s*<!doctype html>/i.test(source)) {
  throw new Error('Website verification failed: invalid HTML doctype');
}

await writeFile(outputPath, html);
console.log(`Prepared LOKTRON website: ${outputPath} (${html.length} bytes)`);
