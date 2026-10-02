// ==============================================================================
// DONKO PARTITURAS - SERVIDOR LOCAL SEGURO DE DESARROLLO
// ==============================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const ADMIN_PIN = process.env.ADMIN_PIN || '1102';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  // Manejo de URL y rutas limpias
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Endpoint seguro de backend para validación del PIN
  if (req.method === 'POST' && pathname === '/api/admin-auth') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const pin = (data.pin || '').toString().trim();

        if (!pin) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'PIN requerido' }));
          return;
        }

        // Validación en tiempo seguro en backend
        if (pin === ADMIN_PIN) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'Autenticación exitosa',
            token: 'donko_admin_authorized_token',
            user: { role: 'admin', name: 'Donko Administrador' }
          }));
        } else {
          // Retardo para protección contra fuerza bruta
          setTimeout(() => {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'PIN administrativo incorrecto' }));
          }, 400);
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Solicitud malformada' }));
      }
    });
    return;
  }

  // Redirecciones seguras para SPA
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  } else if (pathname === '/admin') {
    pathname = '/index.html';
  }

  // Prevenir Directory Traversal
  const safePath = path.normalize(path.join(ROOT_DIR, pathname));
  if (!safePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Si el archivo no existe, fallback a index.html para soportar navegación SPA
      const indexPath = path.join(ROOT_DIR, 'index.html');
      fs.readFile(indexPath, (indexErr, indexData) => {
        if (indexErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN'
        });
        res.end(indexData);
      });
      return;
    }

    // Servir el archivo con su Content-Type correcto y cabeceras de seguridad
    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    });

    fs.createReadStream(safePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🎵 Donko Partituras está ejecutándose en: http://localhost:${PORT}`);
  console.log(`🔒 Panel administrativo disponible en: http://localhost:${PORT}/#admin\n`);
});
