// Local preview server. Sends the same security headers as vercel.json so
// CSP problems show up before deploy. No dependencies.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 8080;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2' };
const allowed = new Set(['index.html', 'css/style.css', 'js/app.js', 'js/engine.js', 'js/worker.js', 'js/theme-init.js', 'js/tour.js', 'fonts/inter-var-latin.woff2']);
const headers = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; worker-src 'self'; connect-src 'none'; font-src 'self'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

const server = createServer(async (req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    path = normalize(path).split(sep).join('/');
  } catch {
    path = null; // malformed URL
  }
  if (!allowed.has(path)) {
    res.writeHead(404, { ...headers, 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { ...headers, 'Content-Type': types[extname(path)] });
    res.end(body);
  } catch {
    res.writeHead(500, headers);
    res.end();
  }
});

// If the port is taken (another copy is already running), try the next few.
let tryPort = port;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && tryPort < port + 10) {
    console.log('Port ' + tryPort + ' is busy, trying ' + (tryPort + 1));
    server.listen(++tryPort, '127.0.0.1');
  } else {
    console.error(err.code === 'EADDRINUSE' ? 'Ports ' + port + '-' + tryPort + ' are all busy. Set another with PORT=9000 npm start' : err.message);
    process.exit(1);
  }
});
server.on('listening', () => console.log('Open http://localhost:' + tryPort + '  (Ctrl + C to stop)'));
server.listen(tryPort, '127.0.0.1');
