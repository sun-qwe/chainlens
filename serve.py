import http.server
import socketserver
import sys
import os
import urllib.parse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    os.chdir(ROOT)
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.allow_reuse_address = True
        print(f"ChainLens demo server: http://127.0.0.1:{PORT}/visualizer/")
        print(f"Data manifest:        http://127.0.0.1:{PORT}/data/manifest.json")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
