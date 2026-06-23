"""主窗口模块。

组合所有 UI 组件，提供侧边导航、内容区域和底部播放栏。
"""

from PySide6.QtCore import Qt, QSize
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QSizePolicy,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from ..core.audio_engine import AudioEngine
from ..core.library_manager import LibraryManager
from ..core.playlist_engine import PlaylistEngine
from ..lyrics.lyrics_manager import LyricsManager
from .import_dialog import ImportDialog
from .library_page import LibraryPage
from .lyrics_page import LyricsPage
from .player_bar import PlayerBar
from .playlist_page import PlaylistPage
from .settings_page import SettingsPage
from .theme import GLOBAL_STYLESHEET, create_dark_palette


class MainWindow(QMainWindow):
    """音乐播放器主窗口。"""

    def __init__(self) -> None:
        super().__init__()

        # 初始化核心组件
        self._audio_engine = AudioEngine(self)
        self._playlist_engine = PlaylistEngine(self._audio_engine, self)
        self._library_manager = LibraryManager()
        self._lyrics_manager = LyricsManager(self._library_manager)

        self._setup_window()
        self._setup_shortcuts()

    def _setup_window(self) -> None:
        """设置窗口属性和布局。"""
        self.setWindowTitle("🎵 MusicPlayer")
        self.setMinimumSize(960, 640)
        self.resize(1200, 800)

        # 应用主题
        QApplication.instance().setPalette(create_dark_palette())
        self.setStyleSheet(GLOBAL_STYLESHEET)

        # 中央部件
        central = QWidget()
        self.setCentralWidget(central)

        main_layout = QVBoxLayout(central)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # 内容区域（侧边栏 + 页面）
        content_layout = QHBoxLayout()
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(0)

        # ── 侧边导航 ──────────────────────────────────────
        nav_widget = self._create_nav()
        content_layout.addWidget(nav_widget)

        # ── 页面堆叠 ──────────────────────────────────────
        self._pages = QStackedWidget()

        self._library_page = LibraryPage(self._library_manager, self._playlist_engine)
        self._playlist_page = PlaylistPage(self._library_manager, self._playlist_engine)
        self._lyrics_page = LyricsPage(self._audio_engine, self._playlist_engine, self._lyrics_manager)
        self._settings_page = SettingsPage()

        self._pages.addWidget(self._library_page)   # index 0
        self._pages.addWidget(self._playlist_page)   # index 1
        self._pages.addWidget(self._lyrics_page)     # index 2
        self._pages.addWidget(self._settings_page)   # index 3

        content_layout.addWidget(self._pages, stretch=1)
        main_layout.addLayout(content_layout, stretch=1)

        # ── 底部播放栏 ────────────────────────────────────
        self._player_bar = PlayerBar(self._audio_engine, self._playlist_engine)
        main_layout.addWidget(self._player_bar)

        # ── 连接信号 ──────────────────────────────────────
        self._library_page.import_requested.connect(self._show_import_dialog)
        self._player_bar.toggle_lyrics_requested.connect(self._show_lyrics_page)

    def _create_nav(self) -> QWidget:
        """创建侧边导航栏。"""
        nav = QWidget()
        nav.setObjectName("navBar")
        nav.setFixedWidth(200)
        nav.setStyleSheet("""
            #navBar {
                background-color: #0d1117;
                border-right: 1px solid #30363d;
            }
        """)

        layout = QVBoxLayout(nav)
        layout.setContentsMargins(12, 16, 12, 16)
        layout.setSpacing(4)

        # Logo
        logo = QLabel("🎵 MusicPlayer")
        logo.setStyleSheet("font-size: 18px; font-weight: bold; color: #00d2ff; padding: 8px 12px;")
        layout.addWidget(logo)

        layout.addSpacing(16)

        # 导航按钮
        self._nav_btns: list[QPushButton] = []

        nav_items = [
            ("📚  音乐库", 0),
            ("📋  播放列表", 1),
            ("🎤  歌词", 2),
            ("⚙️  设置", 3),
        ]

        for text, page_index in nav_items:
            btn = QPushButton(text)
            btn.setProperty("nav", True)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.clicked.connect(lambda checked, idx=page_index: self._switch_page(idx))
            self._nav_btns.append(btn)
            layout.addWidget(btn)

        layout.addStretch()

        # 导入按钮
        self._nav_import_btn = QPushButton("＋ 导入音乐")
        self._nav_import_btn.setProperty("accent", True)
        self._nav_import_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self._nav_import_btn.clicked.connect(self._show_import_dialog)
        layout.addWidget(self._nav_import_btn)

        layout.addSpacing(8)

        return nav

    def _switch_page(self, index: int) -> None:
        """切换页面。"""
        self._pages.setCurrentIndex(index)

        # 更新导航按钮激活状态
        for i, btn in enumerate(self._nav_btns):
            btn.setProperty("active", i == index)
            btn.style().unpolish(btn)
            btn.style().polish(btn)

        # 刷新目标页面
        if index == 0:
            self._library_page.refresh()
        elif index == 1:
            self._playlist_page.refresh()
        elif index == 2:
            self._lyrics_page.refresh()

    def _show_import_dialog(self) -> None:
        """显示导入对话框。"""
        dialog = ImportDialog(self._library_manager, self)
        dialog.import_completed.connect(self._library_page.refresh)
        dialog.import_completed.connect(self._playlist_page.refresh)
        dialog.exec()

    def _show_lyrics_page(self) -> None:
        """切换到歌词页面。"""
        self._switch_page(2)

    def _setup_shortcuts(self) -> None:
        """注册全局快捷键。"""
        # 空格：播放/暂停
        play_action = QAction("播放/暂停", self)
        play_action.setShortcut(QKeySequence("Space"))
        play_action.triggered.connect(self._audio_engine.play_pause)
        self.addAction(play_action)

        # Ctrl+Right：下一首
        next_action = QAction("下一首", self)
        next_action.setShortcut(QKeySequence("Ctrl+Right"))
        next_action.triggered.connect(self._playlist_engine.next)
        self.addAction(next_action)

        # Ctrl+Left：上一首
        prev_action = QAction("上一首", self)
        prev_action.setShortcut(QKeySequence("Ctrl+Left"))
        prev_action.triggered.connect(self._playlist_engine.previous)
        self.addAction(prev_action)

        # Ctrl+Up：音量+
        vol_up = QAction("音量+", self)
        vol_up.setShortcut(QKeySequence("Ctrl+Up"))
        vol_up.triggered.connect(lambda: self._audio_engine.volume_up())
        self.addAction(vol_up)

        # Ctrl+Down：音量-
        vol_down = QAction("音量-", self)
        vol_down.setShortcut(QKeySequence("Ctrl+Down"))
        vol_down.triggered.connect(lambda: self._audio_engine.volume_down())
        self.addAction(vol_down)

        # Ctrl+M：静音
        mute_action = QAction("静音", self)
        mute_action.setShortcut(QKeySequence("Ctrl+M"))
        mute_action.triggered.connect(self._audio_engine.toggle_mute)
        self.addAction(mute_action)

        # Ctrl+I：导入
        import_action = QAction("导入", self)
        import_action.setShortcut(QKeySequence("Ctrl+I"))
        import_action.triggered.connect(self._show_import_dialog)
        self.addAction(import_action)

    def closeEvent(self, event) -> None:
        """关闭窗口时清理资源。"""
        self._audio_engine.stop()
        self._library_manager.close()
        super().closeEvent(event)
