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
    "Keep every reply to 1 or 2 short conversational sentences with zero markdown, bullets, or emojis. "
    "Har jawab max 10-12 shabd ka ek sentence me de. " "Step-1 greeting is ONLY: Namaste, main Ragini bol rahi hoon, kaise hain aap? Uske baad user ke jawab ka wait karo. " "User ke jawab ko pehle acknowledge karo - agar user bole achha hoon / badhiya hoon to pehle bolo Bahut achha, ye sun kar achha laga. " "Step-2 pitch - jab user bole main achha hoon, tab ye bolo: Bahut achha, ye sun kar achha laga. Aapko sahi jaankari dene ke liye maine call kiya hai, kya abhi baat karna sahi rahega? " "Step-3 - jab user bole sahi rahega / boliye, tab dobara mat poochho Batayein kya help karun. Seedha wajah batao. " "CRITICAL LOOP RULE: Agar tumne pichhle turn me hi poochh liya hai kya abhi baat karna sahi rahega, to dobara wahi mat poochho. Agar user dobara bole main badhiya hoon, to usko haan samjho aur Step-3 par jao. " "NEVER ECHO RULE: User ne jo sawal poochha hai, usko wapas sawal bana ke mat poochho. Jaise user bole Is it available in Vrindavan society? to tum mat bolo Is it available? Seedha jawab do. " "NEVER GENERIC ASK RULE: Kabhi mat bolo What would you like to know? / Bataiye kya help karun / Please go ahead and ask your question / Bataiye kis baare me jaankari chahiye. Ye sab loop banata hai. " "ANSWER FIRST RULE: Pehle user ke sawal ka jawab do, phir sirf ek specific sawal poochho. Jaise 2 BHK ke liye bolo Main Vrindavan society me 2 BHK ki availability check karke batati hoon, aapka budget kya hai? " "IF NO INVENTORY: Agar inventory nahi pata to sirf I dont have details bol ke mat ruko. Bolo Main check karke batati hoon, aur ek specific sawal poochho - budget ya timeline. "
)
SYSTEM_PROMPT = os.getenv("AGENT_SYSTEM_PROMPT", "").strip() or DEFAULT_SYSTEM_PROMPT

DEFAULT_GREETING = "Namaste. Main Ragini bol rahi hoon. Kaise hain aap?"
GREETING = os.getenv("AGENT_GREETING", "").strip() or DEFAULT_GREETING

SENTENCE_END = re.compile(r"[.!?।॥]+[\s\"')\]]*|\n+")
MIN_TTS_CHARS = 8
SILENCE_THRESHOLD = int(os.getenv("SILENCE_THRESHOLD", "650"))
BARGE_IN_RMS = int(os.getenv("BARGE_IN_RMS", "1100"))
BARGE_IN_MS = int(os.getenv("BARGE_IN_MS", "800"))
END_OF_SPEECH_MS = int(os.getenv("END_OF_SPEECH_MS", "650"))
NOISE_IGNORE_MS = int(os.getenv("NOISE_IGNORE_MS", "280"))
MIN_SPEECH_MS = int(os.getenv("MIN_SPEECH_MS", "300"))
MIN_AVG_RMS = int(os.getenv("MIN_AVG_RMS", "620"))
POST_PLAYBACK_GUARD_SEC = float(os.getenv("POST_PLAYBACK_GUARD_SEC", "0.15"))

FILLER_ONLY = {
    "yes", "yeah", "yep", "ok", "okay", "sir", "ji", "haan", "ha", "hmm", "hm",
    "halo", "right", "sure", "હા", "જી", "ઓકે", "સર", "हाँ", "जी", "ठीक है"
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
    normalized = re.sub(r"[^\w\s\u0900-\u097F\u0A80-\u0AFF]", "", cleaned.lower()).strip()
    if normalized in {"haan", "ji", "bolo", "ha", "haan ji", "ji haan", "haan bolo"}:
        return False
    if avg_rms < MIN_AVG_RMS and len(cleaned.split()) <= 2:
        return True
    # Reject non-Indian/Arabic garbage hallucinations like 'آپ آپ آپ'
    valid_chars = re.findall(r"[A-Za-z\u0900-\u097F\u0A80-\u0AFF]", cleaned)
    if len(valid_chars) < 2:
        return True
    return False


def parse_language_request(text: str) -> str | None:
    low = text.lower()
    if any(x in low for x in ["gujarati me bolo", "gujarati mein bolo", "gujarati ma bolo", "speak in gujarati", "gujarati bol"]):
        return "gu-IN"
    if any(x in low for x in ["hindi me bolo", "hindi mein bolo", "speak in hindi", "hindi bol"]):
        return "hi-IN"
    if any(x in low for x in ["english me bolo", "english mein bolo", "speak in english", "english bol"]):
        return "en-IN"
    return None

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
        self._turn_lock = None  # loop ke andar banega
        self._play_lock = None  # loop ke andar banega, __init__ me nahi - nahi to lock kaam nahi karta
        self._playback_token = 0
        self.preferred_language: str | None = None
        self._lang_streak = 0
        self._pending_lang = None
        self._last_question = ''
        self._last_question_time = 0.0

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

        # Greeting ke time barge-in band - user greeting ke beech me bole to bhi mat kaato
        _since_start = time.monotonic() - self.started_at
        if agent_speaking:
            # Barge-in BAND - agent bol raha hai to usko kaato mat, bas user ki awaaz sunte raho
            # Neeche wali speech wali line chalegi, _clear_audio kabhi nahi chalega
            pass
        if False:  # purana dead block, kabhi mat chalao
            # Greeting baj rahi hai, user ki awaaz ko barge mat samjho, bas sunte raho
            # yahan return nahi karna, neeche wali speech wali line ko chalne do
            pass
        elif agent_speaking:
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
                print('[TURN-SKIP] Chhoti awaaz ignore, koi prompt nahi bajega'); return
                return

            self._spawn(self._process_utterance(utterance, avg_rms, gen))

    async def _process_utterance(self, *args, **kwargs):
        if self._turn_lock is None:
            self._turn_lock = asyncio.Lock()
        async with self._turn_lock:
            await self._process_utterance_inner(*args, **kwargs)

    async def _process_utterance_inner(self, pcm_audio: bytes, avg_rms: float, gen: int) -> None:
        t0 = time.perf_counter()
        transcript = await self.client.transcribe(pcm_audio, self.input_sample_rate, AGENT_LANGUAGE)
        # gen check BAND - gen badalne se TURN ka jawab rukna nahi chahiye
        t_stt = int((time.perf_counter() - t0) * 1000)

        # Hindi lipi me aaya STT bhi Hindi hi hai - usko unclear mat samjho
        _has_urdu = any('\u0600' <= ch <= '\u06FF' for ch in (transcript or ""))
        if _has_urdu:
            print(f"[LANG-FIX] Hindi lipi STT ko Hindi samjha: {transcript!r}")
        if (not _has_urdu) and is_unclear_transcript(transcript or "", avg_rms):
            print(f"[TURN-UNCLEAR] ({t_stt}ms STT, rms={int(avg_rms)}) raw={transcript!r}")
            print('[TURN-SKIP] Khali awaaz, koi prompt nahi bajega'); return
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
        sentence_buffer: list[str] = []
        buffered_chars = 0
        buffer_flush_chars = 50
        long_sentence_chars = 60

        async def synthesize_sentence(sentence: str, split_long: bool) -> bytes:
            if split_long and len(sentence) > long_sentence_chars:
                midpoint = len(sentence) // 2
                first_pcm, second_pcm = await asyncio.gather(
                    self.client.synthesize(sentence[:midpoint], AGENT_LANGUAGE, TTS_SPEAKER, OUTBOUND_SAMPLE_RATE),
                    self.client.synthesize(sentence[midpoint:], AGENT_LANGUAGE, TTS_SPEAKER, OUTBOUND_SAMPLE_RATE),
                )
                return first_pcm + second_pcm
            return await self.client.synthesize(sentence, AGENT_LANGUAGE, TTS_SPEAKER, OUTBOUND_SAMPLE_RATE)

        async def enqueue_tts(sentence: str, split_long: bool = False) -> None:
            nonlocal first_logged
            full_reply.append(sentence)
            if not first_logged:
                print(f"[TURN] First sentence ready in {int((time.perf_counter() - t0) * 1000)}ms: {sentence}")
                first_logged = True
            tts_tasks.append(asyncio.create_task(synthesize_sentence(sentence, split_long)))

        async def flush_sentence_buffer() -> None:
            nonlocal buffered_chars
            text = " ".join(sentence_buffer).strip()
            sentence_buffer.clear()
            buffered_chars = 0
            if text:
                await enqueue_tts(text)

        async def buffer_sentence(sentence: str) -> None:
            nonlocal buffered_chars
            sentence = sentence.strip()
            if not sentence:
                return
            if len(sentence) >= long_sentence_chars:
                await flush_sentence_buffer()
                await enqueue_tts(sentence)
                return
            sentence_buffer.append(sentence)
            buffered_chars += len(sentence)
            if buffered_chars >= buffer_flush_chars:
                await flush_sentence_buffer()

        async for delta in self.client.stream_reply(self.conversation):
            # gen break BAND - beech me gen badle to bhi stream mat roko
            pending += delta
            match = SENTENCE_END.search(pending)
            while match and match.end() >= MIN_TTS_CHARS:
                sentence = pending[:match.end()].strip()
                pending = pending[match.end():]
                if sentence:
                    await buffer_sentence(sentence)
                match = SENTENCE_END.search(pending)

        if gen == self._generation:
            if pending.strip():
                await buffer_sentence(pending.strip())
            await flush_sentence_buffer()

        for idx, task in enumerate(tts_tasks):
            # gen cancel BAND - TTS task ko beech me cancel mat karo
            try:
                pcm = await task
                print(f'TTS task done, pcm len = {len(pcm)}')
            except asyncio.CancelledError:
                continue
            if True:
                self._suppress_checkpoint = False
                await self._play(pcm, gen)
                self._suppress_checkpoint = False

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

    def _get_play_lock(self):
        # Lock ko pehli baar running loop me banao - tabhi wo asli me lock karega
        if self._play_lock is None:
            self._play_lock = asyncio.Lock()
        return self._play_lock

    async def _play(self, pcm_audio: bytes, gen: int) -> None:
        async with self._get_play_lock():
            await self._play_inner(pcm_audio, gen)

    async def _play_inner(self, pcm_audio: bytes, gen: int) -> None:
        print(f'_play started, len = {len(pcm_audio)}')
        # Audio me sach me awaaz hai ya khali hai - ye check karo
        try:
            import struct
            _n = min(len(pcm_audio)//2, 8000)
            _samples = struct.unpack('<' + 'h'*_n, pcm_audio[:_n*2]) if _n > 0 else (0,)
            _rms = (sum(s*s for s in _samples) / max(1, len(_samples))) ** 0.5 if _samples else 0
            _mx = max(abs(s) for s in _samples) if _samples else 0
            print(f'[AUDIO-CHECK] rms={int(_rms)} max={int(_mx)} - agar rms=0 hai to TTS ne khali audio banaya hai')
        except Exception as e:
            print(f'[AUDIO-CHECK] fail {e}')
        chunk_size = OUTBOUND_SAMPLE_RATE * SAMPLE_WIDTH_BYTES * 20 // 1000
        duration_sec = len(pcm_audio) / (OUTBOUND_SAMPLE_RATE * SAMPLE_WIDTH_BYTES)
        self._playback_token += 1
        _my_token = self._playback_token
        self._playback_active = True
        self._playback_until = time.monotonic() + duration_sec + POST_PLAYBACK_GUARD_SEC
        loop = asyncio.get_running_loop()
        next_send_at = loop.time()
        for offset in range(0, len(pcm_audio), chunk_size):
            if not self._playback_active or _my_token != self._playback_token:
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
        if False:  # CHECKPOINT BAND
            await self.websocket.send_text(json.dumps({"event": "checkpoint", "streamId": self.stream_id, "name": "tts"}))

    async def _clear_audio(self) -> None:
        await self.websocket.send_text(json.dumps({"event": "clearAudio", "streamId": self.stream_id}))
        self._playback_active = False
        self._playback_token += 1
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
