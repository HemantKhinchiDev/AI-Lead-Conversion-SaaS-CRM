import asyncio
import audioop
import base64
import io
import json
import os
import time
import wave
from pathlib import Path
import httpx
import websockets
from dotenv import load_dotenv

load_dotenv(Path(".env"))

HTTP_BASE = "http://127.0.0.1:8010"
WS_URL = "ws://127.0.0.1:8010/ws"
SARVAM_KEY = os.getenv("SARVAM_API_KEY", "").strip()
TTS_SPEAKER = os.getenv("TTS_SPEAKER", "simran_hi_conversation").strip()

QA_TURNS = [
    ("Q1 (Real Estate Hindi)", "hi-IN", "मुझे अहमदाबाद में SG हाईवे के पास 3BHK फ्लैट की जानकारी चाहिए।"),
    ("Q2 (Budget & Possession)", "hi-IN", "मेरा बजट एक करोड़ के आसपास है, रेडी टू मूव ऑप्शन मिल जाएगा क्या?"),
    ("Q3 (Gujarati Switch)", "gu-IN", "શું આ પ્રોજેક્ટમાં ક્લબ હાઉસ અને પાર્કિંગની સુવિધા છે?"),
    ("Q4 (Business Growth English)", "en-IN", "Also tell me how your AI voice assistant helps real estate builders convert leads."),
    ("Q5 (Barge-In Mid-Reply)", "hi-IN", "ठीक है, कल शाम पाँच बजे की साइट विज़िट बुक कर दीजिए।"),
    ("Q6 (Closing / Goodbye)", "hi-IN", "धन्यवाद, सारी जानकारी मिल गई, अब कॉल रख सकते हैं।"),
]


async def synth_caller_mulaw_8k(http: httpx.AsyncClient, text: str, lang: str) -> bytes:
    r = await http.post(
        "https://api.sarvam.ai/text-to-speech",
        headers={"api-subscription-key": SARVAM_KEY},
        json={
            "text": text,
            "target_language_code": lang,
            "speaker": TTS_SPEAKER,
            "model": "bulbul:v4-flash",
            "speech_sample_rate": 8000,
            "output_audio_codec": "linear16",
        },
    )
    if r.status_code != 200:
        raise RuntimeError(f"TTS failed ({r.status_code}): {r.text}")
    raw = base64.b64decode("".join(r.json().get("audios") or []))
    if raw.startswith(b"RIFF"):
        with wave.open(io.BytesIO(raw), "rb") as wf:
            raw = wf.readframes(wf.getnframes())
    return audioop.lin2ulaw(raw, 2)


async def send_mulaw_stream(ws, stream_id: str, mulaw_bytes: bytes, trailing_silence_ms: int = 750) -> None:
    frame_size = 160  # 20ms at 8kHz mulaw
    for i in range(0, len(mulaw_bytes), frame_size):
        chunk = mulaw_bytes[i:i + frame_size]
        await ws.send(json.dumps({
            "event": "media",
            "streamId": stream_id,
            "media": {"payload": base64.b64encode(chunk).decode()},
        }))
        await asyncio.sleep(0.012)
    silence_frame = b"\xff" * frame_size
    for _ in range(trailing_silence_ms // 20):
        await ws.send(json.dumps({
            "event": "media",
            "streamId": stream_id,
            "media": {"payload": base64.b64encode(silence_frame).decode()},
        }))
        await asyncio.sleep(0.012)


async def drain_until_checkpoint(ws, stream_id: str, timeout: float = 15.0) -> dict:
    t0 = time.perf_counter()
    first_audio_ms = None
    audio_frames = 0
    cleared = False
    while True:
        rem = timeout - (time.perf_counter() - t0)
        if rem <= 0:
            break
        raw = await asyncio.wait_for(ws.recv(), timeout=rem)
        msg = json.loads(raw)
        ev = msg.get("event")
        if ev == "playAudio":
            if first_audio_ms is None:
                first_audio_ms = int((time.perf_counter() - t0) * 1000)
            audio_frames += 1
        elif ev == "clearAudio":
            cleared = True
        elif ev == "checkpoint":
            await ws.send(json.dumps({"event": "playedStream", "streamId": stream_id, "name": msg.get("name", "tts")}))
            try:
                nxt = await asyncio.wait_for(ws.recv(), timeout=1.35)
                m2 = json.loads(nxt)
                if m2.get("event") == "playAudio":
                    audio_frames += 1
                    continue
            except asyncio.TimeoutError:
                pass
            break
    return {
        "first_audio_ms": first_audio_ms,
        "audio_frames": audio_frames,
        "audio_sec": round(audio_frames * 0.02, 2),
        "cleared": cleared,
    }


async def main() -> None:
    call_t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=20.0) as http:
        r_health = await http.get(f"{HTTP_BASE}/health")
        r_ans = await http.post(f"{HTTP_BASE}/answer")
        assert r_health.status_code == 200 and r_ans.status_code == 200
        print(f"[QA-INIT] /health=200 /answer=200 | starting 3-min (180s) simulated call...")

        caller_clips = []
        for label, lang, text in QA_TURNS:
            mulaw = await synth_caller_mulaw_8k(http, text, lang)
            caller_clips.append((label, lang, text, mulaw))
        print(f"[QA-INIT] Prepared {len(caller_clips)} caller audio clips.")

        stream_id = "qa-stream-3min-001"
        async with websockets.connect(WS_URL, max_size=2**22) as ws:
            await ws.send(json.dumps({
                "event": "start",
                "streamId": stream_id,
                "start": {
                    "streamId": stream_id,
                    "callId": "qa-call-3min-001",
                    "mediaFormat": {"encoding": "audio/x-mulaw", "sampleRate": 8000},
                },
            }))
            greet = await drain_until_checkpoint(ws, stream_id, timeout=15.0)
            print(f"[GREETING] first_audio={greet['first_audio_ms']}ms | duration={greet['audio_sec']}s ({greet['audio_frames']} frames)")

            target_offsets = [12, 42, 74, 106, 138, 165]
            for idx, ((label, lang, text, mulaw), target_sec) in enumerate(zip(caller_clips, target_offsets)):
                elapsed = time.perf_counter() - call_t0
                if target_sec > elapsed:
                    await asyncio.sleep(target_sec - elapsed)

                print(f"\n--- {label} @ t+{int(time.perf_counter() - call_t0)}s ---")
                print(f"Caller ({lang}): {text}")

                if idx == 4:
                    burst = audioop.lin2ulaw(b"\x00\x30" * 1600, 2)
                    await send_mulaw_stream(ws, stream_id, burst, trailing_silence_ms=100)

                await send_mulaw_stream(ws, stream_id, mulaw, trailing_silence_ms=700)
                res = await drain_until_checkpoint(ws, stream_id, timeout=18.0)
                print(f"Agent Response -> first_audio={res['first_audio_ms']}ms | audio_len={res['audio_sec']}s | clearAudio={res['cleared']}")

            rem_to_180 = 180.0 - (time.perf_counter() - call_t0)
            if rem_to_180 > 0:
                await asyncio.sleep(rem_to_180)

            await ws.send(json.dumps({"event": "stop", "streamId": stream_id}))
            await asyncio.sleep(0.3)

        r_st = await http.post(f"{HTTP_BASE}/stream-status", data={"StreamId": stream_id, "Status": "stopped"})
        r_hu = await http.post(f"{HTTP_BASE}/hangup", data={"CallUUID": "qa-call-3min-001", "HangupCause": "TIME_LIMIT_180S"})
        total_sec = round(time.perf_counter() - call_t0, 2)
        print(f"\n[QA-END] Total duration={total_sec}s | /stream-status={r_st.status_code} | /hangup={r_hu.status_code}")


if __name__ == "__main__":
    asyncio.run(main())
