import http.server
import socketserver
import webbrowser
import os

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

if __name__ == "__main__":
    print(f"==================================================")
    print(f"  🚀 BOLT Localhost Server Running!")
    print(f"  🌐 URL: http://localhost:{PORT}/index2.html")
    print(f"==================================================")
    
    # Automatically open in browser
    webbrowser.open(f"http://localhost:{PORT}/index2.html")
    
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Server stopped.")
