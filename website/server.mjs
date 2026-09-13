import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync } from 'node:zlib';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8' };

let embeddedIndex = null;
try {
  const packed = (await readFile(join(root, 'index.html.br.b64'), 'utf8')).trim();
  embeddedIndex = brotliDecompressSync(Buffer.from(packed, 'base64'));
} catch (error) {
  console.error('Failed to load embedded website source:', error.message);
}

function headers(type) {
  return {
    'Content-Type': type,
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'X-Frame-Options':'SAMEORIGIN',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
    'Cache-Control': type.startsWith('image/') ? 'public, max-age=86400' : 'no-cache'
  };
}

const server = http.createServer(async (req,res) => {
  try {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
      return res.end(JSON.stringify({ ok:true, service:'loktron-web' }));
    }

    const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
    let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    rel = normalize(rel).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, rel);

    try {
      if (!(await stat(file)).isFile()) throw new Error('not-file');
      const body = await readFile(file);
      const type = types[extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, headers(type));
      return res.end(body);
    } catch {
      if (!embeddedIndex) throw new Error('Website index unavailable');
      res.writeHead(200, headers('text/html; charset=utf-8'));
      return res.end(embeddedIndex);
    }
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type':'text/plain; charset=utf-8' });
    res.end('Internal server error');
  }
});

server.listen(port, '0.0.0.0', () => console.log(`LOKTRON website listening on ${port}`));
