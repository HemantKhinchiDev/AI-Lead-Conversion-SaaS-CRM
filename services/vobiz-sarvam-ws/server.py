import html
import os
from pathlib import Path
from urllib.parse import parse_qs
import httpx
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response
from agent import CallSession

load_dotenv(Path(__file__).resolve().parent / ".env")

STREAM_CONTENT_TYPE = os.getenv("STREAM_CONTENT_TYPE", "audio/x-mulaw;rate=8000")
CRM_WEBHOOK_URL = os.getenv("CRM_WEBHOOK_URL", "").strip()
app = FastAPI()

ACTIVE_SESSIONS: dict[str, CallSession] = {}
CALL_SESSIONS_BY_UUID: dict[str, CallSession] = {}


def parse_form_or_json(raw_body: str) -> dict[str, str]:
    if not raw_body:
        return {}
    return {k: v[0] for k, v in parse_qs(raw_body, keep_blank_values=True).items() if v}


def derive_base_url(request: Request) -> str:
    configured = os.getenv("PUBLIC_URL", "").strip().rstrip("/")
    if configured and "your-tunnel-url.example.com" not in configured:
        return configured
    proto = request.headers.get("x-forwarded-proto", request.url.scheme or "https")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    return f"{proto}://{host}".rstrip("/")


def websocket_url(public_url: str) -> str:
    if public_url.startswith("https://"):
        return "wss://" + public_url.removeprefix("https://") + "/ws"
    return "ws://" + public_url.removeprefix("http://") + "/ws"


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({
        "ok": True,
        "gemini": bool(os.getenv("GEMINI_API_KEY", "").strip()),
        "groq": bool(os.getenv("GROQ_API_KEY", "").strip()),
        "sarvam": bool(os.getenv("SARVAM_API_KEY", "").strip()),
        "crm_webhook": bool(CRM_WEBHOOK_URL),
    })


@app.api_route("/answer", methods=["GET", "POST"])
async def answer(request: Request) -> Response:
    base_url = derive_base_url(request)
    ws_url = html.escape(websocket_url(base_url), quote=False)
    status_url = html.escape(f"{base_url}/stream-status", quote=True)
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Stream bidirectional="true" keepCallAlive="true" contentType="{html.escape(STREAM_CONTENT_TYPE, quote=True)}" statusCallbackUrl="{status_url}">{ws_url}</Stream>
</Response>"""
    return Response(content=xml, media_type="application/xml")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    session = CallSession(websocket, registry=ACTIVE_SESSIONS)
    try:
        async for message in websocket.iter_text():
            await session.handle_message(message)
            if session.call_uuid:
                CALL_SESSIONS_BY_UUID[session.call_uuid] = session
    except WebSocketDisconnect as exc:
        print(f"[WS] Disconnected code={exc.code}")
    finally:
        await session.close()


@app.api_route("/stream-status", methods=["GET", "POST"])
async def stream_status(request: Request) -> Response:
    body = (await request.body()).decode("utf-8", errors="replace")
    fields = {**dict(request.query_params), **parse_form_or_json(body)}
    stream_id = fields.get("StreamID") or fields.get("StreamId") or ""
    call_uuid = fields.get("CallUUID") or fields.get("call_uuid") or ""
    if stream_id and call_uuid and stream_id in ACTIVE_SESSIONS:
        sess = ACTIVE_SESSIONS[stream_id]
        sess.call_uuid = call_uuid
        CALL_SESSIONS_BY_UUID[call_uuid] = sess
    print(f"[STREAM-STATUS] {dict(request.query_params)} body={body[:300]}")
    return Response(status_code=204)


@app.api_route("/hangup", methods=["GET", "POST"])
async def hangup(request: Request) -> Response:
    body = (await request.body()).decode("utf-8", errors="replace")
    fields = {**dict(request.query_params), **parse_form_or_json(body)}
    call_uuid = fields.get("CallUUID") or fields.get("call_uuid") or ""
    raw_status = (fields.get("CallStatus") or "completed").lower()
    duration = int(fields["Duration"]) if fields.get("Duration", "").isdigit() else None
    print(f"[HANGUP] {dict(request.query_params)} body={body[:300]}")

    sess = CALL_SESSIONS_BY_UUID.pop(call_uuid, None) if call_uuid else None
    if sess is not None:
        await sess.flush_to_crm(call_status=raw_status, duration_seconds=duration)
    elif call_uuid and CRM_WEBHOOK_URL:
        try:
            async with httpx.AsyncClient(timeout=12.0) as http:
                resp = await http.post(CRM_WEBHOOK_URL, json={
                    "provider": "vobiz",
                    "provider_call_id": call_uuid,
                    "CallUUID": call_uuid,
                    "call_status": raw_status,
                    "duration_seconds": duration or 0,
                })
                print(f"[CRM-WEBHOOK-HANGUP] call_uuid={call_uuid} status={resp.status_code}")
        except Exception as exc:
            print(f"[CRM-WEBHOOK-HANGUP-ERR] call_uuid={call_uuid} err={exc}")

    return Response(status_code=204)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("HTTP_PORT", "8010")))
