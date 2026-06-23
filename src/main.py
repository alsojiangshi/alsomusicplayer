"""MusicPlayer - 跨平台轻量音乐播放器。

支持 Linux 和 Windows，具备：
- 多格式音频播放 (WAV, OGG, MP3, FLAC, M4A 等)
- 在线歌词搜索与本地歌词导入（支持带/不带节奏）
- 多源音乐导入（本地文件、S3/MinIO 对象存储、OpenList 服务）
- 现代暗色主题 UI
- 便携版打包（PyInstaller）

用法:
    python -m src.main
    # 或
    python src/main.py
"""

import sys
import os

# 确保项目根目录在 Python 路径中
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)


def main() -> int:
    """应用入口函数。"""
    from src.app import MusicPlayerApp

    app = MusicPlayerApp()
    return app.run()


if __name__ == "__main__":
    sys.exit(main())
