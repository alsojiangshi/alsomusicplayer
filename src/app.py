"""应用主控制器模块。

负责 QApplication 的创建和主窗口的初始化。
"""

import sys
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import QApplication

from .config import config
from .gui.main_window import MainWindow


class MusicPlayerApp:
    """音乐播放器应用。"""

    def __init__(self) -> None:
        self._app = QApplication(sys.argv)
        self._app.setApplicationName("MusicPlayer")
        self._app.setOrganizationName("MusicPlayer")
        self._app.setApplicationVersion(config.get("app.version", "1.0.0"))

        # 高 DPI 支持
        self._app.setAttribute(Qt.ApplicationAttribute.AA_UseHighDpiPixmaps, True)

        # 应用图标
        self._set_app_icon()

        # 创建主窗口
        self._main_window = MainWindow()

    def _set_app_icon(self) -> None:
        """设置应用图标（尝试多个路径）。"""
        icon_paths = [
            Path(__file__).parent.parent / "resources" / "icons" / "app_icon.png",
            Path(__file__).parent.parent / "resources" / "icons" / "app_icon.svg",
        ]
        for path in icon_paths:
            if path.exists():
                self._app.setWindowIcon(QIcon(str(path)))
                break

    def run(self) -> int:
        """启动应用主循环。"""
        self._main_window.show()
        return self._app.exec()
