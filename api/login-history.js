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

            // Update or insert
            const idx = cloudLogs.findIndex(log => log.sessionId === newRecord.sessionId);
            if (idx !== -1) {
                cloudLogs[idx] = { ...cloudLogs[idx], ...newRecord };
            } else {
                cloudLogs.unshift(newRecord);
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

            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Serverless function error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
