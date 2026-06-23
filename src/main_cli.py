"""MusicPlayer CLI — 终端 TUI 音乐播放器入口。

用法:
    python -m src.main_cli
    # 或打包后:
    ./MusicPlayer-cli
"""

import sys
import os

_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

if __name__ == "__main__":
    from src.cli.app import run_cli
    run_cli()
