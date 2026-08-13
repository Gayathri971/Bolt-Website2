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

function formatDuration(sec) {
    if (!sec || sec < 0) return '0s';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    
    let parts = [];
    if (hrs > 0) parts.push(`${hrs}h`);
    if (mins > 0) parts.push(`${mins}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    return parts.join(' ');
}

function escapeCSV(val) {
    if (val === undefined || val === null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function writeCSV(logs) {
    try {
        // 1. Raw Login History CSV
        const historyHeaders = ['Username', 'Name', 'Login Date', 'Login Time', 'Logout Time', 'Duration (Seconds)', 'IP Address', 'Device', 'Browser', 'OS', 'Status', 'Session ID'];
        const historyRows = logs.map(log => {
            let duration = '';
            if (log.timestamp && log.logoutTimestamp) {
                duration = Math.round((log.logoutTimestamp - log.timestamp) / 1000);
            } else if (log.duration) {
                duration = log.duration;
            } else if (log.logoutTime && log.timestamp) {
                const logoutMs = Date.parse(log.logoutTime);
                if (!isNaN(logoutMs)) {
                    const diff = logoutMs - log.timestamp;
                    if (diff > 0) {
                        duration = Math.round(diff / 1000);
                    }
                }
            }
            return [
                log.username,
                log.name,
                log.loginDate,
                log.loginTime,
                log.logoutTime,
                duration,
                log.ipAddress,
                log.device,
                log.browser,
                log.os,
                log.status,
                log.sessionId
            ].map(escapeCSV).join(',');
        });
        
        const historyCSV = "\uFEFF" + [historyHeaders.join(','), ...historyRows].join('\r\n');
        fs.writeFileSync(path.join(ROOT, 'documents', 'login_history.csv'), historyCSV, 'utf8');

        // 2. Metrics CSV
        const userMetrics = {};
        logs.forEach(log => {
            const uName = (log.username || '').toLowerCase();
            if (!uName) return;
            if (!userMetrics[uName]) {
                userMetrics[uName] = {
                    username: log.username,
                    name: log.name || log.username,
                    visits: 0,
                    totalDuration: 0,
                    lastDuration: null,
                    lastLoginTime: null,
                    isActive: false
                };
            }
            if (log.status === 'Success') {
                userMetrics[uName].visits++;
                
                const loginTimeMs = log.timestamp || 0;
                if (!userMetrics[uName].lastLoginTime || loginTimeMs > userMetrics[uName].lastLoginTime.timestamp) {
                    userMetrics[uName].lastLoginTime = {
                        str: `${log.loginDate} ${log.loginTime}`,
                        timestamp: loginTimeMs
                    };
                }
                if (!log.logoutTime) {
                    const isRecent = (Date.now() - loginTimeMs) < 24 * 60 * 60 * 1000;
                    if (isRecent) {
                        userMetrics[uName].isActive = true;
                    }
                }
                let duration = 0;
                if (log.logoutTimestamp && log.timestamp) {
                    duration = Math.round((log.logoutTimestamp - log.timestamp) / 1000);
                } else if (log.duration) {
                    duration = log.duration;
                } else if (log.logoutTime && log.timestamp) {
                    const logoutMs = Date.parse(log.logoutTime);
                    if (!isNaN(logoutMs)) {
                        const diff = logoutMs - log.timestamp;
                        if (diff > 0) {
                            duration = Math.round(diff / 1000);
                        }
                    }
                }
                if (duration > 0) {
                    userMetrics[uName].totalDuration += duration;
                    if (!userMetrics[uName].lastDurationLogTime || loginTimeMs > userMetrics[uName].lastDurationLogTime) {
                        userMetrics[uName].lastDuration = duration;
                        userMetrics[uName].lastDurationLogTime = loginTimeMs;
                    }
                }
            }
        });

        const metricsHeaders = ['Username', 'Name', 'Number of Visits', 'Total Session Duration (Seconds)', 'Total Session Duration (Formatted)', 'Last Session Duration (Seconds)', 'Last Session Duration (Formatted)', 'Last Login Date/Time', 'Is Active'];
        const metricsRows = Object.values(userMetrics).map(m => {
            const totalDurFormatted = m.totalDuration > 0 ? formatDuration(m.totalDuration) : '0s';
            const lastDurFormatted = m.lastDuration !== null ? formatDuration(m.lastDuration) : 'N/A';
            const lastLoginStr = m.lastLoginTime ? m.lastLoginTime.str : '';
            return [
                m.username,
                m.name,
                m.visits,
                m.totalDuration,
                totalDurFormatted,
                m.lastDuration !== null ? m.lastDuration : '',
                lastDurFormatted,
                lastLoginStr,
                m.isActive ? 'Yes' : 'No'
            ].map(escapeCSV).join(',');
        });

        const metricsCSV = "\uFEFF" + [metricsHeaders.join(','), ...metricsRows].join('\r\n');
        fs.writeFileSync(path.join(ROOT, 'documents', 'login_metrics.csv'), metricsCSV, 'utf8');

        // Write daily backups to documents/backups/
        try {
            const dateObj = new Date();
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const dateString = `${year}-${month}-${day}`;

            const backupsDir = path.join(ROOT, 'documents', 'backups');
            if (!fs.existsSync(backupsDir)) {
                fs.mkdirSync(backupsDir, { recursive: true });
            }
            fs.writeFileSync(path.join(backupsDir, `login_history_backup_${dateString}.csv`), historyCSV, 'utf8');
            fs.writeFileSync(path.join(backupsDir, `login_metrics_backup_${dateString}.csv`), metricsCSV, 'utf8');
        } catch (backupErr) {
            console.error('Failed to write CSV daily backup:', backupErr);
        }

    } catch (e) {
        console.error('Failed to write CSV files:', e);
    }
}

const server = http.createServer((req, res) => {
    // Handle Login History API
    if (req.url.startsWith('/api/login-history') || req.url.startsWith('/api/log-login') || req.url.startsWith('/api/log-logout')) {
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
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(logs));
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
                        const updated = { ...logs[idx], ...newRecord };
                        if (updated.timestamp && updated.logoutTimestamp) {
                            updated.duration = Math.round((updated.logoutTimestamp - updated.timestamp) / 1000);
                        }
                        logs[idx] = updated;
                    } else {
                        // Add new login record
                        logs.unshift(newRecord);
                    }

                    // Ensure documents directory exists
                    const dir = path.dirname(DB_PATH);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    fs.writeFile(DB_PATH, JSON.stringify(logs, null, 2), 'utf8', (writeErr) => {
                        if (writeErr) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Failed to write log' }));
                        } else {
                            writeCSV(logs);
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

    fs.stat(filePath, (error, stats) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`, 'utf-8');
            }
            return;
        }

        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

            if (start >= stats.size || end >= stats.size || start > end) {
                res.writeHead(416, {
                    'Content-Range': `bytes */${stats.size}`,
                    'Access-Control-Allow-Origin': '*'
                });
                return res.end();
            }

            const chunksize = (end - start) + 1;
            const head = {
                'Content-Range': `bytes ${start}-${end}/${stats.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            };
            res.writeHead(206, head);
            if (req.method === 'HEAD') {
                return res.end();
            }
            const file = fs.createReadStream(filePath, { start, end });
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': stats.size,
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            };
            res.writeHead(200, head);
            if (req.method === 'HEAD') {
                return res.end();
            }
            fs.createReadStream(filePath).pipe(res);
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
