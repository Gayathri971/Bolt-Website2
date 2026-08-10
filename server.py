import http.server
import socketserver
import webbrowser
import os

import json
import time

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def format_duration(sec):
    if not sec or sec < 0:
        return '0s'
    hrs = sec // 3600
    mins = (sec % 3600) // 60
    secs = sec % 60
    parts = []
    if hrs > 0:
        parts.append(f"{hrs}h")
    if mins > 0:
        parts.append(f"{mins}m")
    if secs > 0 or not parts:
        parts.append(f"{secs}s")
    return ' '.join(parts)

def escape_csv(val):
    if val is None:
        return ''
    s = str(val)
    if ',' in s or '"' in s or '\n' in s or '\r' in s:
        return f'"{s.replace(chr(34), chr(34)+chr(34))}"'
    return s

def write_csv(logs):
    try:
        # 1. Raw Login History CSV
        history_path = os.path.join(DIRECTORY, 'documents', 'login_history.csv')
        history_headers = ['Username', 'Name', 'Login Date', 'Login Time', 'Logout Time', 'Duration (Seconds)', 'IP Address', 'Device', 'Browser', 'OS', 'Status', 'Session ID']
        history_rows = []
        for log in logs:
            duration = ''
            if log.get('timestamp') and log.get('logoutTimestamp'):
                duration = str(round((log['logoutTimestamp'] - log['timestamp']) / 1000))
            elif log.get('duration'):
                duration = str(log['duration'])
            elif log.get('logoutTime') and log.get('timestamp'):
                try:
                    import datetime
                    dt = datetime.datetime.strptime(log['logoutTime'], '%b %d, %Y %I:%M:%S %p')
                    login_dt = datetime.datetime.fromtimestamp(log['timestamp']/1000.0)
                    diff_sec = round((dt - login_dt).total_seconds())
                    if diff_sec > 0:
                        duration = str(diff_sec)
                except Exception:
                    pass
            
            history_rows.append(','.join(map(escape_csv, [
                log.get('username', ''),
                log.get('name', ''),
                log.get('loginDate', ''),
                log.get('loginTime', ''),
                log.get('logoutTime', ''),
                duration,
                log.get('ipAddress', ''),
                log.get('device', ''),
                log.get('browser', ''),
                log.get('os', ''),
                log.get('status', ''),
                log.get('sessionId', '')
            ])))
        
        with open(history_path, 'w', encoding='utf-8') as f:
            f.write('\ufeff' + ','.join(history_headers) + '\n' + '\n'.join(history_rows))

        # 2. Metrics CSV
        metrics_path = os.path.join(DIRECTORY, 'documents', 'login_metrics.csv')
        user_metrics = {}
        now_ms = int(time.time() * 1000)
        for log in logs:
            u_name = log.get('username', '').lower()
            if not u_name:
                continue
            if u_name not in user_metrics:
                user_metrics[u_name] = {
                    'username': log.get('username', ''),
                    'name': log.get('name') or log.get('username', ''),
                    'visits': 0,
                    'totalDuration': 0,
                    'lastDuration': None,
                    'lastDurationLogTime': 0,
                    'lastLoginTime': None,
                    'isActive': False
                }
            if log.get('status') == 'Success':
                user_metrics[u_name]['visits'] += 1
                login_time_ms = log.get('timestamp', 0)
                
                # Check last login
                if not user_metrics[u_name]['lastLoginTime'] or login_time_ms > user_metrics[u_name]['lastLoginTime']['timestamp']:
                    user_metrics[u_name]['lastLoginTime'] = {
                        'str': f"{log.get('loginDate', '')} {log.get('loginTime', '')}",
                        'timestamp': login_time_ms
                    }
                
                # Check active
                if not log.get('logoutTime'):
                    if (now_ms - login_time_ms) < 24 * 60 * 60 * 1000:
                        user_metrics[u_name]['isActive'] = True
                
                duration = 0
                if log.get('logoutTimestamp') and log.get('timestamp'):
                    duration = round((log['logoutTimestamp'] - log['timestamp']) / 1000)
                elif log.get('duration'):
                    duration = log['duration']
                elif log.get('logoutTime') and log.get('timestamp'):
                    try:
                        import datetime
                        dt = datetime.datetime.strptime(log['logoutTime'], '%b %d, %Y %I:%M:%S %p')
                        login_dt = datetime.datetime.fromtimestamp(log['timestamp']/1000.0)
                        diff_sec = round((dt - login_dt).total_seconds())
                        if diff_sec > 0:
                            duration = diff_sec
                    except Exception:
                        pass
                
                if duration > 0:
                    user_metrics[u_name]['totalDuration'] += duration
                    if login_time_ms > user_metrics[u_name]['lastDurationLogTime']:
                        user_metrics[u_name]['lastDuration'] = duration
                        user_metrics[u_name]['lastDurationLogTime'] = login_time_ms
        
        metrics_headers = ['Username', 'Name', 'Number of Visits', 'Total Session Duration (Seconds)', 'Total Session Duration (Formatted)', 'Last Session Duration (Seconds)', 'Last Session Duration (Formatted)', 'Last Login Date/Time', 'Is Active']
        metrics_rows = []
        for m in user_metrics.values():
            total_dur_form = format_duration(m['totalDuration']) if m['totalDuration'] > 0 else '0s'
            last_dur_form = format_duration(m['lastDuration']) if m['lastDuration'] is not None else 'N/A'
            last_login_str = m['lastLoginTime']['str'] if m['lastLoginTime'] else ''
            
            metrics_rows.append(','.join(map(escape_csv, [
                m['username'],
                m['name'],
                m['visits'],
                m['totalDuration'],
                total_dur_form,
                m['lastDuration'] if m['lastDuration'] is not None else '',
                last_dur_form,
                last_login_str,
                'Yes' if m['isActive'] else 'No'
            ])))
            
        with open(metrics_path, 'w', encoding='utf-8') as f:
            f.write('\ufeff' + ','.join(metrics_headers) + '\n' + '\n'.join(metrics_rows))
            
    except Exception as e:
        print("Failed to write CSV:", e)

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path.startswith('/api/login-history'):
            db_path = os.path.join(DIRECTORY, 'documents', 'login_history.json')
            logs = []
            if os.path.exists(db_path):
                try:
                    with open(db_path, 'r', encoding='utf-8') as f:
                        logs = json.load(f)
                except Exception:
                    pass
            
            thirty_days_ago = int(time.time() * 1000) - 30 * 24 * 60 * 60 * 1000
            filtered = [log for log in logs if log.get('timestamp', 0) >= thirty_days_ago] if isinstance(logs, list) else []

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(filtered).encode('utf-8'))
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/login-history'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                new_record = json.loads(body)
            except Exception:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Invalid JSON'}).encode('utf-8'))
                return

            client_ip = self.headers.get('X-Forwarded-For')
            if not client_ip:
                client_ip = self.client_address[0]
            if not new_record.get('ipAddress') or new_record.get('ipAddress') == 'Unknown':
                new_record['ipAddress'] = client_ip

            db_path = os.path.join(DIRECTORY, 'documents', 'login_history.json')
            logs = []
            if os.path.exists(db_path):
                try:
                    with open(db_path, 'r', encoding='utf-8') as f:
                        logs = json.load(f)
                except Exception:
                    pass
            if not isinstance(logs, list):
                logs = []

            # If it is a new record or an update to an existing session
            session_id = new_record.get('sessionId')
            idx = -1
            if session_id:
                for i, log in enumerate(logs):
                    if log.get('sessionId') == session_id:
                        idx = i
                        break

            if idx != -1:
                logs[idx].update(new_record)
                if logs[idx].get('timestamp') and logs[idx].get('logoutTimestamp'):
                    logs[idx]['duration'] = round((logs[idx]['logoutTimestamp'] - logs[idx]['timestamp']) / 1000)
            else:
                logs.insert(0, new_record)

            thirty_days_ago = int(time.time() * 1000) - 30 * 24 * 60 * 60 * 1000
            filtered = [log for log in logs if log.get('timestamp', 0) >= thirty_days_ago]

            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            try:
                with open(db_path, 'w', encoding='utf-8') as f:
                    json.dump(filtered, f, indent=2)
                write_csv(filtered)
            except Exception:
                self.send_response(500)
                self.end_headers()
                return

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'success': True, 'record': new_record}).encode('utf-8'))
            return

        self.send_response(404)
        self.end_headers()

if __name__ == "__main__":
    print(f"==================================================")
    print(f"  🚀 BOLT Localhost Server Running!")
    print(f"  🌐 URL: http://localhost:{PORT}/index.html")
    print(f"==================================================")
    
    # Automatically open in browser
    webbrowser.open(f"http://localhost:{PORT}/index.html")
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped.")
