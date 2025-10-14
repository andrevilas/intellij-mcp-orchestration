from __future__ import annotations

import argparse
import sys

from .config import load_settings
from .server import run_stdio


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MCP server para Zhipu GLM-4.6")
    parser.add_argument("--stdio", action="store_true", help="Executa o servidor no modo stdio (default)")
    args = parser.parse_args(argv)

    if not args.stdio:
        parser.print_help()
        return 0

    try:
        settings = load_settings()
    except Exception as exc:  # pylint: disable=broad-except
        sys.stderr.write(f"[ERROR] {exc}\n")
        return 2

    run_stdio(settings)
    return 0


if __name__ == "__main__":
    sys.exit(main())
