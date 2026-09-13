import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));

async function rebuildAndroid() {
  const partsDir = join(root, 'ui/app-final-br-parts');
  const names = (await readdir(partsDir)).filter(n => /^part-\d+\.txt$/.test(n));
  if (!names.length) throw new Error(`No Android UI source parts found in ${partsDir}`);

  const chunks = [];
  for (const name of names) {
    const text = (await readFile(join(partsDir, name), 'utf8')).trim();
    chunks.push({ name, text, padded: /=\s*$/.test(text) });
  }

  // Base64 padding is valid only at the end. Keep numbered order for ordinary
  // chunks and place the padded terminal chunk last. This also tolerates the
  // historical upload order where a later full-size chunk followed the tail.
  chunks.sort((a, b) => {
    if (a.padded !== b.padded) return a.padded ? 1 : -1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  const encoded = chunks.map(c => c.text).join('');
  const compressed = Buffer.from(encoded, 'base64');
  const html = brotliDecompressSync(compressed);
  const output = join(root, 'android/app/src/main/assets/index.html');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);
  return { output, parts: chunks.map(c => c.name), bytes: html.length };
}

const android = await rebuildAndroid();
console.log('Prepared Android UI:', android);
