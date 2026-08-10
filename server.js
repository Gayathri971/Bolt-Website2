const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8000;
const ROOT = __dirname;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.pdf': 'application/pdf'
};

const DB_PATH = path.join(ROOT, 'documents', 'login_history.json');

const server = http.createServer((req, res) => {
    // Handle Login History API
    if (req.url.startsWith('/api/login-history')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (req.method === 'GET') {
            fs.readFile(DB_PATH, 'utf8', (err, data) => {
                let logs = [];
                if (!err && data) {
                    try { logs = JSON.parse(data); } catch(e) {}
                }
                const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                const filtered = Array.isArray(logs) ? logs.filter(log => log.timestamp >= thirtyDaysAgo) : [];
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(filtered));
            });
            return;
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                let newRecord;
                try {
                    newRecord = JSON.parse(body);
                } catch(e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                    return;
                }

                // Inject remote IP if not present in request body
                const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
                if (!newRecord.ipAddress || newRecord.ipAddress === 'Unknown') {
                    newRecord.ipAddress = clientIp;
                }

                fs.readFile(DB_PATH, 'utf8', (err, data) => {
                    let logs = [];
                    if (!err && data) {
                        try { logs = JSON.parse(data); } catch(e) {}
                    }
                    if (!Array.isArray(logs)) logs = [];

                    // If it is a new record or an update to an existing session
                    const idx = logs.findIndex(log => log.sessionId === newRecord.sessionId && log.sessionId);
                    if (idx !== -1) {
                        // Update existing session record (e.g. adding logout timestamp)
                        logs[idx] = { ...logs[idx], ...newRecord };
                    } else {
                        // Add new login record
                        logs.unshift(newRecord);
                    }

                    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
                    const filtered = logs.filter(log => log.timestamp >= thirtyDaysAgo);

                    // Ensure documents directory exists
                    const dir = path.dirname(DB_PATH);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    fs.writeFile(DB_PATH, JSON.stringify(filtered, null, 2), 'utf8', (writeErr) => {
                        if (writeErr) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Failed to write log' }));
                        } else {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, record: newRecord }));
                        }
                    });
                });
            });
            return;
        }
    }

    let filePath = path.join(ROOT, req.url === '/' ? 'index.html' : decodeURIComponent(req.url));
    let extname = String(path.extname(filePath)).toLowerCase();
    let contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`, 'utf-8');
            }
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    const url = `http://localhost:${PORT}/index.html`;
    console.log(`==================================================`);
    console.log(`  🚀 BOLT Localhost Server Running!`);
    console.log(`  🌐 URL: ${url}`);
    console.log(`==================================================`);

    // Auto open in default browser
    const startCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    exec(`${startCmd} ${url}`);
});
