import { logLoginToSheet, logLogoutToSheet } from './_sheets.js';

const CLOUD_DB_URL = 'https://jsonbin-zeta.vercel.app/api/bins/k3gwO0bXZP';

export default async function handler(req, res) {
    // Enable CORS for frontend clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const response = await fetch(CLOUD_DB_URL);
            if (!response.ok) {
                return res.status(response.status).json({ error: 'Failed to fetch from cloud database' });
            }
            const data = await response.json();
            return res.status(200).json(data);
        }

        if (req.method === 'POST') {
            const newRecord = req.body;
            if (!newRecord || !newRecord.sessionId) {
                return res.status(400).json({ error: 'Invalid record' });
            }

            // Fetch current cloud logs
            const response = await fetch(CLOUD_DB_URL);
            let cloudLogs = [];
            if (response.ok) {
                cloudLogs = await response.json();
            }
            if (!Array.isArray(cloudLogs)) cloudLogs = [];

            // Helper to format date/time
            const formatDateTime = (ts) => {
                if (!ts) return { date: '', time: '' };
                const date = new Date(ts);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hrs = String(date.getHours()).padStart(2, '0');
                const mins = String(date.getMinutes()).padStart(2, '0');
                const secs = String(date.getSeconds()).padStart(2, '0');
                return {
                    date: `${year}-${month}-${day}`,
                    time: `${hrs}:${mins}:${secs}`
                };
            };

            // Update or insert
            const idx = cloudLogs.findIndex(log => log.sessionId === newRecord.sessionId);
            let mergedRecord;
            if (idx !== -1) {
                cloudLogs[idx] = { ...cloudLogs[idx], ...newRecord };
                
                // Calculate duration if we have timestamps
                if (cloudLogs[idx].timestamp && cloudLogs[idx].logoutTimestamp) {
                    const diffSeconds = Math.round((cloudLogs[idx].logoutTimestamp - cloudLogs[idx].timestamp) / 1000);
                    const hrs = String(Math.floor(diffSeconds / 3600)).padStart(2, '0');
                    const mins = String(Math.floor((diffSeconds % 3600) / 60)).padStart(2, '0');
                    const secs = String(diffSeconds % 60).padStart(2, '0');
                    cloudLogs[idx].duration = `${hrs}:${mins}:${secs}`;
                }
                mergedRecord = cloudLogs[idx];
            } else {
                cloudLogs.unshift(newRecord);
                mergedRecord = newRecord;
            }

            // Save back to cloud
            const saveResponse = await fetch(CLOUD_DB_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cloudLogs)
            });

            if (!saveResponse.ok) {
                return res.status(saveResponse.status).json({ error: 'Failed to save to cloud database' });
            }

            // Direct Google Sheets Logging
            try {
                const isLogout = newRecord.logoutTime || newRecord.logoutTimestamp;
                if (isLogout) {
                    console.log(`Directly logging logout to Google Sheets for Session: ${newRecord.sessionId}`);
                    await logLogoutToSheet({ sessionId: newRecord.sessionId });
                } else {
                    console.log(`Directly logging login to Google Sheets for: ${newRecord.name || newRecord.username}`);
                    await logLoginToSheet({
                        name: newRecord.name || newRecord.username,
                        sessionId: newRecord.sessionId
                    });
                }
            } catch (sheetErr) {
                console.error('Failed to log to Google Sheets in login-history handler:', sheetErr);
                // Google Sheets error should not block user experience
            }

            // Generate JSON Log in Vercel stdout for pipeline retrieval
            const loginInfo = formatDateTime(mergedRecord.timestamp);
            const logoutInfo = formatDateTime(mergedRecord.logoutTimestamp);
            
            const logMessage = {
                name: mergedRecord.name || mergedRecord.username,
                loginDate: loginInfo.date,
                loginTime: loginInfo.time,
                logoutTime: logoutInfo.time,
                duration: mergedRecord.duration || ''
            };
            console.log("VERCEL_LOGIN_JSON:" + JSON.stringify(logMessage));

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Serverless function error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
