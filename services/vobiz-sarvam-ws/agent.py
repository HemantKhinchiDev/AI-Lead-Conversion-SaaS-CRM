import asyncio
import audioop
import base64
import json
import os
import re
import time
from typing import Any
import httpx
from sarvam import VoicePipelineClient

OUTBOUND_SAMPLE_RATE = int(os.getenv("OUTBOUND_SAMPLE_RATE", "8000"))
SAMPLE_WIDTH_BYTES = 2
AGENT_LANGUAGE = os.getenv("AGENT_LANGUAGE", "unknown")
TTS_SPEAKER = os.getenv("TTS_SPEAKER", "simran_hi_conversation")
CRM_WEBHOOK_URL = os.getenv("CRM_WEBHOOK_URL", "").strip()

DEFAULT_SYSTEM_PROMPT = (
    "You are a helpful, friendly AI business assistant speaking on a live phone call. "
    "Adapt naturally to whatever business, service, or inquiry the caller mentions without assuming a specific industry. "
    "CRITICAL LANGUAGE RULE: Match the exact language of the caller's LATEST message on EVERY turn (Hindi, Gujarati, or English). "
    "If the caller speaks English, reply strictly in English. If Gujarati, reply strictly in Gujarati. If Hindi, reply strictly in Hindi. "
    "Never repeat a question you already asked in the previous turn. "
    "Keep every reply to 1 or 2 short conversational sentences with zero markdown, bullets, or emojis."
)
SYSTEM_PROMPT = os.getenv("AGENT_SYSTEM_PROMPT", "").strip() or DEFAULT_SYSTEM_PROMPT

DEFAULT_GREETING = "नमस्ते! मैं आपकी बिज़नेस इंक्वायरी के सिलसिले में बात कर रही हूँ। बताइए, आज मैं आपकी क्या मदद कर सकती हूँ?"
GREETING = os.getenv("AGENT_GREETING", "").strip() or DEFAULT_GREETING

SENTENCE_END = re.compile(r"[.!?।॥]+[\s\"')\]]*|\n+")
MIN_TTS_CHARS = 14
SILENCE_THRESHOLD = int(os.getenv("SILENCE_THRESHOLD", "650"))
BARGE_IN_RMS = int(os.getenv("BARGE_IN_RMS", "1100"))
BARGE_IN_MS = int(os.getenv("BARGE_IN_MS", "300"))
END_OF_SPEECH_MS = int(os.getenv("END_OF_SPEECH_MS", "900"))
NOISE_IGNORE_MS = int(os.getenv("NOISE_IGNORE_MS", "280"))
MIN_SPEECH_MS = int(os.getenv("MIN_SPEECH_MS", "420"))
MIN_AVG_RMS = int(os.getenv("MIN_AVG_RMS", "620"))
POST_PLAYBACK_GUARD_SEC = float(os.getenv("POST_PLAYBACK_GUARD_SEC", "0.35"))

FILLER_ONLY = {
    "yes", "yeah", "yep", "ok", "okay", "sir", "ji", "haan", "ha", "hmm", "hm",
    "hello", "halo", "right", "sure", "હા", "જી", "ઓકે", "સર", "हाँ", "जी", "ठीक है"
}


def is_filler_only(text: str) -> bool:
    cleaned = re.sub(r"[^\w\s\u0900-\u097F\u0A80-\u0AFF]", "", text.lower()).strip()
    if not cleaned:
        return True
    words = cleaned.split()
    return len(words) <= 2 and all(w in FILLER_ONLY for w in words)


def is_unclear_transcript(text: str, avg_rms: float) -> bool:
    cleaned = text.strip()
    if not cleaned:
        return True
    if avg_rms < MIN_AVG_RMS and len(cleaned.split()) <= 2:
        return True
    # Reject non-Indian/Arabic garbage hallucinations like 'آپ آپ آپ'
    valid_chars = re.findall(r"[A-Za-z\u0900-\u097F\u0A80-\u0AFF]", cleaned)
    if len(valid_chars) < 2:
        return True
    return False


def detect_language_code(text: str) -> str:
    if re.search(r"[\u0A80-\u0AFF]", text):
        return "gu-IN"
    if re.search(r"[\u0900-\u097F]", text):
        return "hi-IN"
    if re.search(r"[A-Za-z]", text):
        return "en-IN"
    return "hi-IN"


def language_directive(lang_code: str) -> str:
    if lang_code == "en-IN":
        return "MANDATORY: Respond strictly in English using English alphabet ONLY. Zero Gujarati or Hindi words."
    if lang_code == "gu-IN":
        return "MANDATORY: Respond strictly in Gujarati (ગુજરાતી લિપિ) ONLY. Zero English sentences or Hindi."
    return "MANDATORY: Respond strictly in Hindi (देवनागरी लिपि) ONLY. Zero Gujarati or English sentences."


def pick_unclear_prompt(last_reply: str) -> str:
    if re.search(r"[\u0A80-\u0AFF]", last_reply):
        return "માફ કરશો, મને તમારો અવાજ સ્પષ્ટ સંભળાયો નથી, કૃપા કરીને ફરીથી બોલો."
    if re.search(r"[\u0900-\u097F]", last_reply):
        return "माफ़ कीजिएगा, मुझे आपकी आवाज़ साफ़ सुनाई नहीं दी, कृपया दोबारा बोलिए।"
    if last_reply.strip():
        return "Sorry, I couldn't hear you clearly, please say that again."
    return "माफ़ कीजिएगा, मुझे आपकी आवाज़ साफ़ सुनाई नहीं दी, कृपया दोबारा बोलिए।"


class CallSession:
    def __init__(self, websocket: Any, registry: dict[str, "CallSession"] | None = None) -> None:
        self.websocket = websocket
        self.registry = registry
        self.stream_id: str | None = None
        self.call_uuid: str | None = None
        self.started_at = time.monotonic()
        self.detected_language = "hi-IN"
        self.transcript_lines: list[str] = []
        self._webhook_sent = False
        self.input_sample_rate = 8000
        self.input_encoding = "audio/x-mulaw"
        self.client = VoicePipelineClient()
        self.conversation = [{"role": "system", "content": SYSTEM_PROMPT}]
        self._last_assistant_reply = ""
        self._audio = bytearray()
        self._rms_weighted_sum = 0.0
        self._rms_total_ms = 0.0
        self._speech_ms = 0.0
        self._silence_ms = 0.0
        self._barge_speech_ms = 0.0
        self._speech_active = False
        self._playback_active = False
        self._playback_until = 0.0
        self._generation = 0
        self._tasks: set[asyncio.Task] = set()

    async def handle_message(self, raw_message: str) -> None:
        data = json.loads(raw_message)
        event = data.get("event")
        if event == "start":
            await self._handle_start(data)
        elif event == "media":
            await self._handle_media(data)
        elif event in {"playedStream", "clearedAudio"}:
            self._playback_active = False
            self._playback_until = time.monotonic() + POST_PLAYBACK_GUARD_SEC

    async def _handle_start(self, data: dict) -> None:
        start = data.get("start") or {}
        self.stream_id = data.get("streamId") or start.get("streamId")
        self.call_uuid = (
            data.get("callUuid")
            or data.get("callId")
            or start.get("callUuid")
            or start.get("callId")
            or self.call_uuid
        )
        if self.registry is not None and self.stream_id:
            self.registry[self.stream_id] = self
        media_format = start.get("mediaFormat") or {}
        self.input_sample_rate = int(media_format.get("sampleRate", 8000))
        self.input_encoding = str(media_format.get("encoding", "audio/x-mulaw"))
        print(f"[WS] Call started stream_id={self.stream_id} call_uuid={self.call_uuid} rate={self.input_sample_rate} enc={self.input_encoding}")
        self._spawn(self._speak(GREETING, self._generation, record_history=True))

    async def _handle_media(self, data: dict) -> None:
        media = data.get("media") or {}
        payload = media.get("payload")
        if not payload:
            return
        raw = base64.b64decode(payload)
        pcm = audioop.ulaw2lin(raw, 2) if self.input_encoding == "audio/x-mulaw" else raw
        chunk_ms = len(pcm) * 1000 / (self.input_sample_rate * SAMPLE_WIDTH_BYTES)
        rms = audioop.rms(pcm, SAMPLE_WIDTH_BYTES)
        now = time.monotonic()
        agent_speaking = (self._playback_active and now < self._playback_until) or (now < self._playback_until)

        if agent_speaking:
            if rms >= BARGE_IN_RMS:
                self._barge_speech_ms += chunk_ms
                if self._barge_speech_ms >= BARGE_IN_MS:
                    self._generation += 1
                    self._barge_speech_ms = 0.0
                    await self._clear_audio()
            else:
                self._barge_speech_ms = 0.0
                return

        if rms >= SILENCE_THRESHOLD:
            self._speech_active = True
            self._speech_ms += chunk_ms
            self._silence_ms = 0.0
            self._audio.extend(pcm)
            self._rms_weighted_sum += rms * chunk_ms
            self._rms_total_ms += chunk_ms
        elif self._speech_active:
            self._silence_ms += chunk_ms
            self._audio.extend(pcm)

        if self._speech_active and self._silence_ms >= END_OF_SPEECH_MS:
            utterance = bytes(self._audio)
            speech_ms = self._speech_ms
            avg_rms = (self._rms_weighted_sum / self._rms_total_ms) if self._rms_total_ms > 0 else 0.0
            self._audio.clear()
            self._rms_weighted_sum = 0.0
            self._rms_total_ms = 0.0
            self._speech_ms = self._silence_ms = 0.0
            self._barge_speech_ms = 0.0
            self._speech_active = False

            # Silently ignore short clicks, line static, or echo bursts (< 280ms)
            if speech_ms < NOISE_IGNORE_MS:
                return

            gen = self._generation
            if speech_ms < MIN_SPEECH_MS:
                print(f"[TURN-UNCLEAR] Cut speech ({int(speech_ms)}ms, rms={int(avg_rms)})")
                self._spawn(self._speak(pick_unclear_prompt(self._last_assistant_reply), gen, record_history=False))
                return

            self._spawn(self._process_utterance(utterance, avg_rms, gen))

    async def _process_utterance(self, pcm_audio: bytes, avg_rms: float, gen: int) -> None:
        t0 = time.perf_counter()
        transcript = await self.client.transcribe(pcm_audio, self.input_sample_rate, AGENT_LANGUAGE)
        if gen != self._generation:
            return
        t_stt = int((time.perf_counter() - t0) * 1000)

        if is_unclear_transcript(transcript or "", avg_rms):
            print(f"[TURN-UNCLEAR] ({t_stt}ms STT, rms={int(avg_rms)}) raw={transcript!r}")
            await self._speak(pick_unclear_prompt(self._last_assistant_reply), gen, record_history=False)
            return

        if is_filler_only(transcript):
            print(f"[TURN-SKIP] Ignored short filler ({t_stt}ms STT): {transcript}")
            return

        print(f"[TURN] Caller ({t_stt}ms STT): {transcript}")
        self.detected_language = detect_language_code(transcript)
        self.transcript_lines.append(f"Lead: {transcript}")
        directive = language_directive(self.detected_language)
        self.conversation[0]["content"] = f"{SYSTEM_PROMPT}\n{directive}"
        self.conversation.append({
            "role": "user",
            "content": f"{transcript}\n({directive})",
        })

        pending = ""
        full_reply = []
        tts_tasks: list[asyncio.Task[bytes]] = []
        first_logged = False

        async def enqueue_tts(sentence: str) -> None:
            nonlocal first_logged
            full_reply.append(sentence)
            if not first_logged:
                print(f"[TURN] First sentence ready in {int((time.perf_counter() - t0) * 1000)}ms: {sentence}")
                first_logged = True
            tts_tasks.append(asyncio.create_task(
                self.client.synthesize(sentence, AGENT_LANGUAGE, TTS_SPEAKER, OUTBOUND_SAMPLE_RATE)
            ))

        async for delta in self.client.stream_reply(self.conversation):
            if gen != self._generation:
                break
            pending += delta
            match = SENTENCE_END.search(pending)
            if match and match.end() >= MIN_TTS_CHARS:
                sentence = pending[:match.end()].strip()
                pending = pending[match.end():]
                if sentence:
                    await enqueue_tts(sentence)

        if gen == self._generation and pending.strip():
            await enqueue_tts(pending.strip())

        for task in tts_tasks:
            if gen != self._generation:
                task.cancel()
                continue
            try:
                pcm = await task
            except asyncio.CancelledError:
                continue
            if gen == self._generation:
                await self._play(pcm, gen)

        if full_reply:
            joined = " ".join(full_reply)
            self._last_assistant_reply = joined
            self.transcript_lines.append(f"AI Agent: {joined}")
            self.conversation.append({"role": "assistant", "content": joined})

    async def _speak(self, text: str, gen: int, record_history: bool = False) -> None:
        pcm = await self.client.synthesize(text, AGENT_LANGUAGE, TTS_SPEAKER, OUTBOUND_SAMPLE_RATE)
        if gen == self._generation:
            if record_history:
                self._last_assistant_reply = text
                self.transcript_lines.append(f"AI Agent: {text}")
                self.conversation.append({"role": "assistant", "content": text})
            await self._play(pcm, gen)

    async def _play(self, pcm_audio: bytes, gen: int) -> None:
        chunk_size = OUTBOUND_SAMPLE_RATE * SAMPLE_WIDTH_BYTES * 20 // 1000
        duration_sec = len(pcm_audio) / (OUTBOUND_SAMPLE_RATE * SAMPLE_WIDTH_BYTES)
        self._playback_active = True
        self._playback_until = max(self._playback_until, time.monotonic()) + duration_sec + POST_PLAYBACK_GUARD_SEC
        loop = asyncio.get_running_loop()
        next_send_at = loop.time()
        for offset in range(0, len(pcm_audio), chunk_size):
            if gen != self._generation or not self._playback_active:
                break
            await self.websocket.send_text(json.dumps({
                "event": "playAudio",
                "streamId": self.stream_id,
                "media": {
                    "contentType": "audio/x-l16",
                    "sampleRate": OUTBOUND_SAMPLE_RATE,
                    "payload": base64.b64encode(pcm_audio[offset:offset + chunk_size]).decode(),
                },
            }))
            next_send_at += 0.020
            await asyncio.sleep(max(0.0, next_send_at - loop.time()))
        if gen == self._generation:
            await self.websocket.send_text(json.dumps({"event": "checkpoint", "streamId": self.stream_id, "name": "tts"}))

    async def _clear_audio(self) -> None:
        await self.websocket.send_text(json.dumps({"event": "clearAudio", "streamId": self.stream_id}))
        self._playback_active = False
        self._playback_until = 0.0

    def _spawn(self, coroutine) -> None:
        task = asyncio.create_task(coroutine)
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    def build_webhook_payload(self, call_status: str = "completed", duration_seconds: int | None = None) -> dict[str, Any]:
        dur = duration_seconds if duration_seconds is not None else max(1, int(round(time.monotonic() - self.started_at)))
        full_transcript = "\n".join(self.transcript_lines).strip()
        payload: dict[str, Any] = {
            "provider": "vobiz",
            "call_status": call_status,
            "duration_seconds": dur,
            "transcript": full_transcript,
            "full_transcript": full_transcript,
            "language": self.detected_language,
        }
        if self.call_uuid:
            payload["provider_call_id"] = self.call_uuid
            payload["CallUUID"] = self.call_uuid
        return payload

    async def flush_to_crm(self, call_status: str = "completed", duration_seconds: int | None = None) -> None:
        webhook_url = CRM_WEBHOOK_URL or os.getenv("CRM_WEBHOOK_URL", "").strip()
        if self._webhook_sent or not webhook_url or not self.call_uuid:
            return
        self._webhook_sent = True
        payload = self.build_webhook_payload(call_status=call_status, duration_seconds=duration_seconds)
        try:
            async with httpx.AsyncClient(timeout=12.0) as http:
                resp = await http.post(webhook_url, json=payload)
                print(f"[CRM-WEBHOOK] call_uuid={self.call_uuid} status={resp.status_code} body={resp.text[:200]}")
        except Exception as exc:
            print(f"[CRM-WEBHOOK-ERR] call_uuid={self.call_uuid} err={exc}")

    async def close(self) -> None:
        self._generation += 1
        for task in list(self._tasks):
            task.cancel()
        await self.flush_to_crm(call_status="completed")
        if self.registry is not None and self.stream_id:
            self.registry.pop(self.stream_id, None)
        await self.client.aclose()
