import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.md':'text/plain; charset=utf-8','.lyricmotion':'text/plain; charset=utf-8','.zip':'application/zip'};
const server = http.createServer(async (request, response) => {
 try {
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  const url = new URL(request.url, 'http://localhost'), parts = decodeURIComponent(url.pathname).split('/');
  if (parts.some(p => p.startsWith('.') && p !== '')) { response.writeHead(403).end(); return; }
  let target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (target !== root && !target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  if ((await stat(target)).isDirectory()) { if (!url.pathname.endsWith('/')) { response.writeHead(301,{Location:url.pathname+'/'+url.search}).end(); return; } target = path.join(target,'index.html'); }
  const info = await stat(target); if (!info.isFile()) throw new Error('Not a file');
  response.writeHead(200, {'Content-Type':types[path.extname(target)] || 'application/octet-stream','Content-Length':info.size});
  if (request.method === 'HEAD') response.end(); else createReadStream(target).on('error',()=>response.destroy()).pipe(response);
 } catch { response.writeHead(404).end('Not found'); }
});
server.listen(Number(process.env.PORT || 8080),'127.0.0.1',()=>console.log(`Lyric Motion Renderer: http://127.0.0.1:${server.address().port}/`));
