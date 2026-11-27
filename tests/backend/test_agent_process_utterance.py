import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services" / "vobiz-sarvam-ws"))

import agent
from agent import CallSession


class FakeVoiceClient:
    def __init__(self, deltas: list[str]) -> None:
        self._deltas = list(deltas)
        self.synthesized: list[str] = []

    async def transcribe(self, pcm_audio: bytes, sample_rate: int, language_code: str) -> str:
        return "Can you help me with this?"

    async def stream_reply(self, messages: list[dict]) -> object:
        for delta in self._deltas:
            yield delta

    async def synthesize(
        self, text: str, language_code: str, speaker: str, sample_rate: int
    ) -> bytes:
        self.synthesized.append(text)
        return text.encode("utf-8")

    async def aclose(self) -> None:
        pass


def run_utterance(deltas: list[str], monkeypatch) -> tuple[list[str], list[str]]:
    client = FakeVoiceClient(deltas)
    monkeypatch.setattr(agent, "VoicePipelineClient", lambda: client)
    session = CallSession(websocket=object())
    played: list[str] = []

    async def record_play(pcm_audio: bytes, gen: int) -> None:
        played.append(pcm_audio.decode("utf-8"))

    monkeypatch.setattr(session, "_play", record_play)
    asyncio.run(session._process_utterance(b"pcm", 1000.0, session._generation))
    return client.synthesized, played


def test_two_short_sentences_are_combined_into_one_stream(monkeypatch) -> None:
    synthesized, played = run_utterance(["Hi.", " How are you?"], monkeypatch)

    assert synthesized == ["Hi. How are you?"]
    assert played == ["Hi. How are you?"]


def test_short_sentences_after_first_sentence_are_buffered(monkeypatch) -> None:
    synthesized, played = run_utterance(["Hi, how are you?", " ", "I am fine."], monkeypatch)

    assert synthesized == ["Hi, how are you? I am fine."]
    assert played == ["Hi, how are you? I am fine."]


def test_long_sentence_is_sent_as_its_own_stream(monkeypatch) -> None:
    short = "Sure, I can help."
    long_sentence = (
        "I can explain the complete details of the available property options "
        "and the next steps clearly."
    )
    assert len(long_sentence) >= 80

    synthesized, played = run_utterance([short, long_sentence], monkeypatch)

    assert synthesized == [short, long_sentence]
    assert played == [short, long_sentence]


def test_accumulated_sentences_flush_at_threshold(monkeypatch) -> None:
    chunks = [
        "First point is quite clear.",
        "Second point is also clear.",
        "Third point is very clear.",
        "Fourth point is fully clear.",
        "Fifth point is finally clear.",
    ]

    synthesized, _ = run_utterance(chunks, monkeypatch)

    assert len(synthesized) == 2
    assert synthesized[0] == " ".join(chunks[:4])
    assert synthesized[1] == chunks[4]


def test_final_buffer_is_flushed_at_utterance_end(monkeypatch) -> None:
    synthesized, played = run_utterance(["Ok."], monkeypatch)

    assert synthesized == ["Ok."]
    assert played == ["Ok."]
