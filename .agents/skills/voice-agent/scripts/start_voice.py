"""Start a voice conversation session from the command line.

Usage:
  python start_voice.py                  # direct mode (mic + speaker)
  python start_voice.py --mode meeting   # loopback (listen to meetings)
  python start_voice.py --mode call      # duplex (mic + loopback)
  python start_voice.py --stt cloud      # force cloud STT
  python start_voice.py --tts cloud      # force cloud TTS
"""

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from hands.voice.channel import VoiceChannel


async def main():
    parser = argparse.ArgumentParser(description="Parix Voice Agent")
    parser.add_argument("--mode", default="direct", choices=["direct", "meeting", "call", "loopback", "duplex"])
    parser.add_argument("--stt", default="auto", choices=["auto", "local", "cloud"])
    parser.add_argument("--tts", default="auto", choices=["auto", "local", "cloud"])
    args = parser.parse_args()

    vc = VoiceChannel()
    await vc.start(mode=args.mode, stt=args.stt, tts=args.tts)

    print(f"Voice agent running in {args.mode} mode. Press Ctrl+C to stop.")
    try:
        while vc.state.active:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        await vc.stop()
        print("Voice agent stopped.")


if __name__ == "__main__":
    asyncio.run(main())
