const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5173;
const DIST = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const PUBLIC = path.join(__dirname, 'public');

const server = http.createServer((req, res) => {
  const cleanUrl = req.url.split('?')[0];
  const relativePath = cleanUrl === '/' ? 'index.html' : cleanUrl.replace(/^\/+/, '');
  let filePath = path.join(DIST, relativePath);

  // Check DIST first, then fallback to PUBLIC
  if (!fs.existsSync(filePath)) {
    const publicPath = path.join(PUBLIC, relativePath);
    if (fs.existsSync(publicPath) && !fs.statSync(publicPath).isDirectory()) {
      filePath = publicPath;
    } else {
      filePath = path.join(DIST, 'index.html');
    }
  } else if (fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SmartEV UI running cleanly at http://localhost:${PORT}/`);
});
