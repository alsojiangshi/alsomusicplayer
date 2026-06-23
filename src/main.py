"""MusicPlayer — 跨平台轻量音乐播放器。

支持 CLI/TUI 和 GUI 双模式。

用法:
    python -m src.main                  # 自动检测 (GUI 优先)
    python -m src.main --cli            # CLI/TUI 模式
    python -m src.main --gui            # GUI 模式
"""

import argparse
import sys
import os

_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="🎵 MusicPlayer — 跨平台音乐播放器",
    )
    parser.add_argument(
        "--cli", action="store_true",
        help="以 CLI/TUI 终端模式运行",
    )
    parser.add_argument(
        "--gui", action="store_true",
        help="以 GUI 图形界面模式运行",
    )
    args = parser.parse_args()

    if args.cli:
        from src.cli.app import run_cli
        run_cli()
    elif args.gui:
        from src.app import MusicPlayerApp
        app = MusicPlayerApp()
        return app.run()
    else:
        # 自动检测：如果有 DISPLAY 则用 GUI，否则用 CLI
        if os.name == "nt" or os.environ.get("DISPLAY"):
            from src.app import MusicPlayerApp
            app = MusicPlayerApp()
            return app.run()
        else:
            from src.cli.app import run_cli
            run_cli()

    return 0


if __name__ == "__main__":
    sys.exit(main())
