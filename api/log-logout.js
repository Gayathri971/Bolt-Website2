import { logLogoutToSheet } from './_sheets.js';

export default async function handler(req, res) {
    // Enable CORS for frontend clients
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ error: 'Missing sessionId' });
        }

        console.log(`Logging logout for Session: ${sessionId}`);
        await logLogoutToSheet({ sessionId });

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Serverless function error in log-logout:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
