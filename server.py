import http.server
import socketserver
import webbrowser
import os

import json
import time

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

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
            else:
                logs.insert(0, new_record)

            thirty_days_ago = int(time.time() * 1000) - 30 * 24 * 60 * 60 * 1000
            filtered = [log for log in logs if log.get('timestamp', 0) >= thirty_days_ago]

            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            try:
                with open(db_path, 'w', encoding='utf-8') as f:
                    json.dump(filtered, f, indent=2)
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
