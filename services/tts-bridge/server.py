import asyncio
import os
from urllib.parse import parse_qs, urlparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import edge_tts

SECRET = os.environ.get("TTS_BRIDGE_SECRET", "").strip()
PORT = int(os.environ.get("TTS_BRIDGE_PORT", "8787"))

ALLOWED_VOICES = {
    "hi-IN-SwaraNeural",
    "hi-IN-MadhurNeural",
    "en-IN-NeerjaNeural",
    "en-IN-PrabhatNeural",
    "gu-IN-DhwaniNeural",
    "gu-IN-NiranjanNeural",
}

async def synthesize_mp3(text: str, voice: str, rate: str, volume: str) -> bytes:
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, volume=volume)
    chunks = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])
    return b"".join(chunks)

class TtsHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def finish(self):
        try:
            super().finish()
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _safe_write(self, payload: bytes):
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/tts":
            self.send_response(404)
            self.end_headers()
            return

        qs = parse_qs(parsed.query)
        if SECRET and (qs.get("key", [""])[0].strip() != SECRET):
            self.send_response(401)
            self.end_headers()
            self._safe_write(b"Unauthorized")
            return

        text = (qs.get("text", [""])[0] or "").strip()[:600]
        voice = (qs.get("voice", ["hi-IN-SwaraNeural"])[0] or "hi-IN-SwaraNeural").strip()
        rate = (qs.get("rate", ["+18%"])[0] or "+18%").strip()
        volume = (qs.get("volume", ["+35%"])[0] or "+35%").strip()

        if voice not in ALLOWED_VOICES:
            voice = "hi-IN-SwaraNeural"
        if not text:
            self.send_response(400)
            self.end_headers()
            self._safe_write(b"Missing text")
            return

        try:
            data = asyncio.run(synthesize_mp3(text, voice, rate, volume))
            if len(data) < 512:
                raise RuntimeError("Empty audio")
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self._safe_write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            try:
                self.send_response(502)
                self.end_headers()
                self._safe_write(str(exc).encode("utf-8", errors="ignore"))
            except (BrokenPipeError, ConnectionResetError):
                pass

if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), TtsHandler)
    print(f"TTS_BRIDGE_RUNNING on 0.0.0.0:{PORT}", flush=True)
    server.serve_forever()
