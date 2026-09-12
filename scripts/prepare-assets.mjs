import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

async function assemble(partsDir, output) {
  const names = (await readdir(partsDir)).filter(n => /^part-\d+\.txt$/.test(n)).sort();
  if (!names.length) throw new Error(`No source parts found in ${partsDir}`);
  const chunks = [];
  for (const name of names) chunks.push(await readFile(join(partsDir, name), 'utf8'));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, chunks.join(''), 'utf8');
  return { output, parts: names.length, bytes: Buffer.byteLength(chunks.join('')) };
}

const website = await assemble(join(root, 'website/source-parts'), join(root, 'website/index.html'));
const android = await assemble(join(root, 'android/app/src/main/assets-parts'), join(root, 'android/app/src/main/assets/index.html'));
console.log('Prepared:', website, android);
