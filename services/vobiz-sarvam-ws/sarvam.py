import base64
import io
import json
import os
import wave
from typing import AsyncIterator
import httpx

SARVAM_BASE_URL = "https://api.sarvam.ai"
STT_MODEL = os.getenv("SARVAM_STT_MODEL", "saaras:v4")
SARVAM_LLM_MODEL = os.getenv("SARVAM_LLM_MODEL", "sarvam-105b-conversations")
TTS_MODEL = os.getenv("SARVAM_TTS_MODEL", "bulbul:v4-flash")
SAMPLE_WIDTH_BYTES = 2


class SarvamError(RuntimeError):
    pass


def pcm_to_wav(pcm_audio: bytes, sample_rate: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(SAMPLE_WIDTH_BYTES)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_audio)
    return buffer.getvalue()


def raw_linear16(audio: bytes) -> bytes:
    if audio.startswith(b"RIFF"):
        with wave.open(io.BytesIO(audio), "rb") as wav_file:
            return wav_file.readframes(wav_file.getnframes())
    return audio


class VoicePipelineClient:
    def __init__(self) -> None:
        self.sarvam_key = os.getenv("SARVAM_API_KEY", "").strip()
        self.sarvam_llm_model = os.getenv("SARVAM_LLM_MODEL", SARVAM_LLM_MODEL).strip()
        self.gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
        self.groq_key = os.getenv("GROQ_API_KEY", "").strip()
        self.groq_model = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b").strip()

        self._sarvam_headers = {"api-subscription-key": self.sarvam_key}
        self._sarvam_http = httpx.AsyncClient(base_url=SARVAM_BASE_URL, timeout=25.0)
        self._llm_http = httpx.AsyncClient(timeout=25.0)

    async def aclose(self) -> None:
        await self._sarvam_http.aclose()
        await self._llm_http.aclose()

    async def transcribe(self, pcm_audio: bytes, sample_rate: int, language_code: str) -> str:
        wav_audio = pcm_to_wav(pcm_audio, sample_rate)
        response = await self._sarvam_http.post(
            "/speech-to-text",
            headers=self._sarvam_headers,
            files={"file": ("caller.wav", wav_audio, "audio/wav")},
            data={"model": STT_MODEL, "mode": "codemix", "language_code": language_code},
        )
        response.raise_for_status()
        return (response.json().get("transcript") or "").strip()

    async def stream_reply(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        if self.gemini_key:
            try:
                async for chunk in self._stream_gemini(messages):
                    yield chunk
                return
            except Exception as exc:
                print(f"[LLM] Gemini failed ({exc}), falling back to Sarvam LLM")

        if self.sarvam_key:
            try:
                async for chunk in self._stream_sarvam(messages):
                    yield chunk
                return
            except Exception as exc:
                print(f"[LLM] Sarvam LLM failed ({exc}), falling back to Groq")

        if self.groq_key:
            async for chunk in self._stream_groq(messages):
                yield chunk
            return

        yield "Maaf kijiye, abhi AI service connect nahi ho pa rahi hai."

    async def _stream_sarvam(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        payload = {
            "model": self.sarvam_llm_model,
            "messages": messages,
            "temperature": 0.35,
            "max_tokens": 160,
            "stream": True,
        }
        async with self._sarvam_http.stream(
            "POST", "/v1/chat/completions", headers=self._sarvam_headers, json=payload
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                raw = line[5:].strip()
                if not raw or raw == "[DONE]":
                    continue
                data = json.loads(raw)
                for choice in data.get("choices", []):
                    delta = (choice.get("delta") or {}).get("content")
                    if delta:
                        yield delta

    async def _stream_gemini(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        system_text = ""
        contents = []
        for msg in messages:
            if msg["role"] == "system":
                system_text = msg["content"]
            else:
                role = "model" if msg["role"] == "assistant" else "user"
                contents.append({"role": role, "parts": [{"text": msg["content"]}]})

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.gemini_model}:streamGenerateContent?alt=sse&key={self.gemini_key}"
        payload = {
            "contents": contents,
            "generationConfig": {"temperature": 0.35, "maxOutputTokens": 160},
        }
        if system_text:
            payload["systemInstruction"] = {"parts": [{"text": system_text}]}

        async with self._llm_http.stream("POST", url, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                raw = line[5:].strip()
                if not raw or raw == "[DONE]":
                    continue
                data = json.loads(raw)
                for cand in data.get("candidates", []):
                    for part in (cand.get("content") or {}).get("parts", []):
                        text = part.get("text")
                        if text:
                            yield text

    async def _stream_groq(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {"Authorization": f"Bearer {self.groq_key}", "Content-Type": "application/json"}
        payload = {
            "model": self.groq_model,
            "messages": messages,
            "temperature": 0.35,
            "max_tokens": 160,
            "stream": True,
        }
        async with self._llm_http.stream("POST", url, headers=headers, json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data:"):
                    continue
                raw = line[5:].strip()
                if not raw or raw == "[DONE]":
                    continue
                data = json.loads(raw)
                for choice in data.get("choices", []):
                    delta = (choice.get("delta") or {}).get("content")
                    if delta:
                        yield delta

    async def synthesize(self, text: str, language_code: str, speaker: str, sample_rate: int) -> bytes:
        tts_lang = "hi-IN" if language_code == "unknown" else language_code
        response = await self._sarvam_http.post(
            "/text-to-speech",
            headers=self._sarvam_headers,
            json={
                "text": text,
                "target_language_code": tts_lang,
                "speaker": speaker,
                "model": TTS_MODEL,
                "speech_sample_rate": sample_rate,
                "output_audio_codec": "linear16",
            },
        )
        response.raise_for_status()
        audios = response.json().get("audios") or []
        if not audios:
            raise SarvamError("Sarvam TTS returned no audio")
        return raw_linear16(base64.b64decode("".join(audios)))
