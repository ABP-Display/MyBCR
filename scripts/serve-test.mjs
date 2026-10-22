import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

// Exercise the built site under a project subpath, like GitHub Pages.
const root = resolve('dist');
let workerTestVersion='';
const mime = { '.html': 'text/html', '.txt':'text/plain', '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.gz': 'application/gzip' };
createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if(request.method==='POST'&&url.pathname==='/MiniBCR/__test/sw'){
    const chunks=[];for await(const chunk of request)chunks.push(chunk);
    workerTestVersion=Buffer.concat(chunks).toString().replace(/[^a-zA-Z0-9-]/g,'').slice(0,100);
    response.writeHead(204).end();return;
  }
  if (!url.pathname.startsWith('/MiniBCR/')) { response.writeHead(404).end(); return; }
  const path = resolve(root, decodeURIComponent(url.pathname.slice('/MiniBCR/'.length)) || 'index.html');
  if (!path.startsWith(`${root}/`)) { response.writeHead(403).end(); return; }
  try {
    let bytes = await readFile(path);
    if(url.pathname==='/MiniBCR/sw.js'&&workerTestVersion)bytes=Buffer.concat([bytes,Buffer.from(`\n// test release ${workerTestVersion}`)]);
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
}).listen(4173, '127.0.0.1');
