import crypto from 'crypto';

export default async function handler(req, res) {
    // Enable CORS for dashboard testing
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const vercelToken = process.env.VERCEL_API_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const CLOUD_DB_URL = 'https://jsonbin-zeta.vercel.app/api/bins/k3gwO0bXZP';

    // Validate environment variables
    if (!vercelToken || !projectId || !serviceAccountEmail || !privateKey || !spreadsheetId) {
        return res.status(400).json({
            error: 'Missing environment variables. Please check VERCEL_API_TOKEN, VERCEL_PROJECT_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and GOOGLE_SHEET_ID.'
        });
    }

    try {
        console.log('Initiating Vercel & Cloud Logs Sync pipeline...');

        // 1. Authenticate with Google Sheets using JWT
        const gAccessToken = await getGoogleAccessToken(serviceAccountEmail, privateKey);
        
        // 2. Fetch current rows from the Google Sheet
        const sheetRange = 'Sheet1!A1:E1000';
        const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetRange}`;
        const getResponse = await fetch(getUrl, {
            headers: { Authorization: `Bearer ${gAccessToken}` }
        });

        if (!getResponse.ok) {
            const errText = await getResponse.text();
            throw new Error(`Google Sheets API error (GET): ${errText}`);
        }

        const getData = await getResponse.json();
        let rows = getData.values || [];

        // 3. Initialize headers if sheet is empty
        if (rows.length === 0) {
            console.log('Google Sheet is empty. Initializing headers...');
            const headers = ['Name', 'Login Date', 'Login Time', 'Logout Time', 'Duration'];
            const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`;
            await fetch(appendUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${gAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values: [headers] })
            });
            rows = [headers];
        }

        // Map existing rows (skip header row)
        // Key: Name | Login Date | Login Time
        const existingRowMap = {};
        for (let i = 1; i < rows.length; i++) {
            const name = rows[i][0] || '';
            const loginDate = rows[i][1] || '';
            const loginTime = rows[i][2] || '';
            const key = `${name.toLowerCase()}|${loginDate}|${loginTime}`;
            existingRowMap[key] = {
                rowIndex: i + 1, // 1-indexed row number in sheet (headers are row 1)
                logoutTime: rows[i][3] || '',
                duration: rows[i][4] || ''
            };
        }

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

        const mergedLogEvents = [];

        // 4. Fetch the historical logs from the Cloud Database
        try {
            console.log('Fetching historical logs from Cloud DB...');
            const cloudDbRes = await fetch(CLOUD_DB_URL);
            if (cloudDbRes.ok) {
                const cloudLogs = await cloudDbRes.json();
                if (Array.isArray(cloudLogs)) {
                    cloudLogs.forEach(record => {
                        if (record.timestamp) {
                            const loginInfo = formatDateTime(record.timestamp);
                            const logoutInfo = formatDateTime(record.logoutTimestamp);
                            
                            // Format duration as HH:mm:ss if it is in seconds or not set
                            let duration = record.duration || '';
                            if (typeof duration === 'number' || (typeof duration === 'string' && !duration.includes(':') && duration !== '')) {
                                const diffSeconds = parseInt(duration, 10);
                                const hrs = String(Math.floor(diffSeconds / 3600)).padStart(2, '0');
                                const mins = String(Math.floor((diffSeconds % 3600) / 60)).padStart(2, '0');
                                const secs = String(diffSeconds % 60).padStart(2, '0');
                                duration = `${hrs}:${mins}:${secs}`;
                            } else if (record.timestamp && record.logoutTimestamp && !duration) {
                                const diffSeconds = Math.round((record.logoutTimestamp - record.timestamp) / 1000);
                                const hrs = String(Math.floor(diffSeconds / 3600)).padStart(2, '0');
                                const mins = String(Math.floor((diffSeconds % 3600) / 60)).padStart(2, '0');
                                const secs = String(diffSeconds % 60).padStart(2, '0');
                                duration = `${hrs}:${mins}:${secs}`;
                            }

                            mergedLogEvents.push({
                                name: record.name || record.username,
                                loginDate: loginInfo.date,
                                loginTime: loginInfo.time,
                                logoutTime: logoutInfo.time,
                                duration: duration
                            });
                        }
                    });
                }
            }
        } catch (dbErr) {
            console.warn('Could not fetch historical logs from Cloud DB:', dbErr.message);
        }

        // 5. Fetch the latest deployment ID from Vercel API
        let deploymentId = '';
        try {
            const deploymentsUrl = `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`;
            const deploymentsResponse = await fetch(deploymentsUrl, {
                headers: { Authorization: `Bearer ${vercelToken}` }
            });

            if (deploymentsResponse.ok) {
                const deploymentsData = await deploymentsResponse.json();
                const latestDeployment = deploymentsData.deployments?.[0];
                if (latestDeployment) {
                    deploymentId = latestDeployment.uid;
                }
            }
        } catch (depErr) {
            console.warn('Could not fetch Vercel deployment ID:', depErr.message);
        }

        // 6. Fetch Vercel Runtime Logs (if deployment ID was found)
        if (deploymentId) {
            try {
                console.log(`Fetching runtime logs for deployment: ${deploymentId}`);
                const logsUrl = `https://api.vercel.com/v1/projects/${projectId}/deployments/${deploymentId}/runtime-logs?limit=100`;
                const logsResponse = await fetch(logsUrl, {
                    headers: { Authorization: `Bearer ${vercelToken}` }
                });

                if (logsResponse.ok) {
                    const logsText = await logsResponse.text();
                    const logLines = logsText.split('\n').filter(Boolean);
                    console.log(`Fetched ${logLines.length} raw log events from Vercel.`);

                    for (const line of logLines) {
                        try {
                            const logObj = JSON.parse(line);
                            const msg = logObj.message || '';
                            if (msg.startsWith('VERCEL_LOGIN_JSON:')) {
                                const jsonStr = msg.substring('VERCEL_LOGIN_JSON:'.length);
                                const record = JSON.parse(jsonStr);
                                if (record && record.name && record.loginDate && record.loginTime) {
                                    mergedLogEvents.push(record);
                                }
                            }
                        } catch (err) {
                            // Skip invalid lines
                        }
                    }
                }
            } catch (logsErr) {
                console.warn('Could not fetch Vercel runtime logs:', logsErr.message);
            }
        }

        console.log(`Total merged login/logout log events to sync: ${mergedLogEvents.length}`);

        // 7. Process events and update/append rows
        let appends = [];
        let updatesCount = 0;

        // Process logs (we reverse to process oldest logs first so list order matches chronological)
        const sortedEvents = [...mergedLogEvents].reverse();

        for (const event of sortedEvents) {
            const key = `${event.name.toLowerCase()}|${event.loginDate}|${event.loginTime}`;
            const existing = existingRowMap[key];

            if (!existing) {
                // Scenario A: Row doesn't exist, append new record
                appends.push([
                    event.name,
                    event.loginDate,
                    event.loginTime,
                    event.logoutTime || '',
                    event.duration || ''
                ]);
                // Add to local map to prevent duplicates in the same run
                existingRowMap[key] = {
                    rowIndex: rows.length + appends.length,
                    logoutTime: event.logoutTime || '',
                    duration: event.duration || ''
                };
            } else {
                // Scenario B: Row exists. Check if we should update logout details
                const needsUpdate = event.logoutTime && (!existing.logoutTime || existing.logoutTime === '');
                if (needsUpdate) {
                    const updateRange = `Sheet1!A${existing.rowIndex}:E${existing.rowIndex}`;
                    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${updateRange}?valueInputOption=USER_ENTERED`;
                    
                    const updateRes = await fetch(updateUrl, {
                        method: 'PUT',
                        headers: {
                            Authorization: `Bearer ${gAccessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            values: [[
                                event.name,
                                event.loginDate,
                                event.loginTime,
                                event.logoutTime,
                                event.duration
                            ]]
                        })
                    });

                    if (updateRes.ok) {
                        existing.logoutTime = event.logoutTime;
                        existing.duration = event.duration;
                        updatesCount++;
                    } else {
                        console.error(`Failed to update row A${existing.rowIndex} in Google Sheets:`, await updateRes.text());
                    }
                }
            }
        }

        // Write batch appends
        if (appends.length > 0) {
            const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`;
            const appendRes = await fetch(appendUrl, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${gAccessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values: appends })
            });
            if (!appendRes.ok) {
                throw new Error(`Google Sheets API error (APPEND): ${await appendRes.text()}`);
            }
        }

        console.log(`Sync pipeline complete. Appended ${appends.length} rows, Updated ${updatesCount} rows.`);

        return res.status(200).json({
            success: true,
            appended: appends.length,
            updated: updatesCount
        });

    } catch (error) {
        console.error('Pipeline Execution Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

// Helper to generate Google Service Account Access Token using Web Crypto API (RSASSA-PKCS1-v1_5)
async function getGoogleAccessToken(email, rawKey) {
    const formattedKey = rawKey.replace(/\\n/g, '\n');
    
    // Extract key body and convert to binary buffer
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const keyBody = formattedKey
        .replace(pemHeader, '')
        .replace(pemFooter, '')
        .replace(/\s/g, '');
    const derBuffer = Buffer.from(keyBody, 'base64');

    // Create JWT Claims
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claims = {
        iss: email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const claimsB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signInput = `${headerB64}.${claimsB64}`;

    // Import PKCS#8 private key
    const privateKeyObj = await crypto.subtle.importKey(
        'pkcs8',
        derBuffer,
        {
            name: 'RSASSA-PKCS1-v1_5',
            hash: 'SHA-256'
        },
        false,
        ['sign']
    );

    // Sign the assertion
    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        privateKeyObj,
        Buffer.from(signInput)
    );

    const signatureB64 = Buffer.from(signature).toString('base64url');
    const assertion = `${signInput}.${signatureB64}`;

    // Request Access Token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: assertion
        })
    });

    if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Google OAuth token retrieval failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
}
