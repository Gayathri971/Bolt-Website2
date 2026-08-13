import crypto from 'crypto';

// Helper to format date/time in Asia/Kolkata (IST) timezone
export function getISTDateTime(dateObj = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const parts = formatter.formatToParts(dateObj);
    const partMap = {};
    parts.forEach(p => partMap[p.type] = p.value);
    
    const dateStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
    const timeStr = `${partMap.hour}:${partMap.minute}:${partMap.second}`;
    
    return { date: dateStr, time: timeStr, timestamp: dateObj.getTime() };
}

// Generate Google Service Account Access Token using JWT
export async function getGoogleAccessToken(email, rawKey) {
    const formattedKey = rawKey.replace(/\\n/g, '\n');
    
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const keyBody = formattedKey
        .replace(pemHeader, '')
        .replace(pemFooter, '')
        .replace(/\s/g, '');
    const derBuffer = Buffer.from(keyBody, 'base64');

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

    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        privateKeyObj,
        Buffer.from(signInput)
    );

    const signatureB64 = Buffer.from(signature).toString('base64url');
    const assertion = `${signInput}.${signatureB64}`;

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

// Log a successful login directly to Google Sheets
export async function logLoginToSheet({ name, sessionId }) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!email || !privateKey || !spreadsheetId) {
        throw new Error('Missing Google Sheets environment variables');
    }

    const token = await getGoogleAccessToken(email, privateKey);
    const istTime = getISTDateTime();

    // Headers check / Initialisation
    const checkUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:E1`;
    const checkRes = await fetch(checkUrl, {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (!checkData.values || checkData.values.length === 0) {
            const headers = ['Name', 'Login Date', 'Login Time', 'Logout Time', 'Duration', 'Session ID'];
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values: [headers] })
            });
        }
    }

    // Row: [Name, Login Date, Login Time, Logout Time, Duration, Session ID]
    const row = [name, istTime.date, istTime.time, '', '', sessionId];

    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`;
    const response = await fetch(appendUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [row] })
    });

    if (!response.ok) {
        throw new Error(`Failed to append login row: ${await response.text()}`);
    }
}

// Log a logout event (update row) directly in Google Sheets
export async function logLogoutToSheet({ sessionId }) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    if (!email || !privateKey || !spreadsheetId) {
        throw new Error('Missing Google Sheets environment variables');
    }

    const token = await getGoogleAccessToken(email, privateKey);

    // Fetch Column F (Session IDs) to find the matching row
    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!F1:F1000`;
    const getResponse = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!getResponse.ok) {
        throw new Error(`Failed to fetch session IDs: ${await getResponse.text()}`);
    }

    const data = await getResponse.json();
    const sessionIds = data.values || [];

    // Find row index (1-based index)
    let rowIndex = -1;
    for (let i = 0; i < sessionIds.length; i++) {
        if (sessionIds[i][0] === sessionId) {
            rowIndex = i + 1; // row index in sheet (header is row 1)
            break;
        }
    }

    if (rowIndex === -1) {
        console.warn(`No active session found in Sheet for Session ID: ${sessionId}`);
        return;
    }

    // Fetch the login date and time from the matching row (Columns B and C)
    const rowUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!B${rowIndex}:C${rowIndex}`;
    const rowResponse = await fetch(rowUrl, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!rowResponse.ok) {
        throw new Error(`Failed to fetch login time for row ${rowIndex}: ${await rowResponse.text()}`);
    }

    const rowData = await rowResponse.json();
    const values = rowData.values || [[]];
    const loginDate = values[0][0] || '';
    const loginTime = values[0][1] || '';

    // Generate current logout details in IST
    const istTime = getISTDateTime();
    let duration = '';

    if (loginDate && loginTime) {
        try {
            const loginDateObj = new Date(`${loginDate}T${loginTime}+05:30`);
            const logoutDateObj = new Date(`${istTime.date}T${istTime.time}+05:30`);
            const diffSeconds = Math.round((logoutDateObj.getTime() - loginDateObj.getTime()) / 1000);
            if (diffSeconds >= 0) {
                const hrs = String(Math.floor(diffSeconds / 3600)).padStart(2, '0');
                const mins = String(Math.floor((diffSeconds % 3600) / 60)).padStart(2, '0');
                const secs = String(diffSeconds % 60).padStart(2, '0');
                duration = `${hrs}:${mins}:${secs}`;
            }
        } catch (e) {
            console.error('Error calculating duration:', e);
        }
    }

    // Update Columns D and E (Logout Time and Duration)
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!D${rowIndex}:E${rowIndex}?valueInputOption=USER_ENTERED`;
    const updateResponse = await fetch(updateUrl, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            values: [[istTime.time, duration]]
        })
    });

    if (!updateResponse.ok) {
        throw new Error(`Failed to update logout row: ${await updateResponse.text()}`);
    }
}
