#!/usr/bin/env python3
"""Run the Kalshi autotrader demo loop."""
from pathlib import Path
import sys

from dotenv import load_dotenv

load_dotenv()

sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))

from kalshi_autotrader.runner import main

if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
