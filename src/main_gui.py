"""MusicPlayer GUI — 图形界面音乐播放器入口。

用法:
    python -m src.main_gui
    # 或打包后:
    ./MusicPlayer-gui
"""

import sys
import os

_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

if __name__ == "__main__":
    from src.app import MusicPlayerApp
    app = MusicPlayerApp()
    sys.exit(app.run())
