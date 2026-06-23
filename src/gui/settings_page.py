"""设置页面。

管理应用配置，包括音频输出、歌词源、S3/OpenList 导入配置等。
"""

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ..config import config


class SettingsPage(QWidget):
    """设置页面，使用标签页组织不同类别的设置。"""

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self._setup_ui()
        self._load_settings()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.setSpacing(16)

        title = QLabel("⚙️ 设置")
        title.setStyleSheet("font-size: 20px; font-weight: bold;")
        layout.addWidget(title)

        tabs = QTabWidget()

        # ── 音频设置 ──────────────────────────────────────
        tabs.addTab(self._create_audio_tab(), "音频")

        # ── 歌词设置 ──────────────────────────────────────
        tabs.addTab(self._create_lyrics_tab(), "歌词")

        # ── S3 设置 ──────────────────────────────────────
        tabs.addTab(self._create_s3_tab(), "S3 存储")

        # ── OpenList 设置 ────────────────────────────────
        tabs.addTab(self._create_openlist_tab(), "OpenList")

        layout.addWidget(tabs)

        # ── 保存按钮 ──────────────────────────────────────
        btn_layout = QHBoxLayout()
        btn_layout.addStretch()

        self._save_btn = QPushButton("💾 保存设置")
        self._save_btn.setProperty("accent", True)
        self._save_btn.clicked.connect(self._save_settings)
        btn_layout.addWidget(self._save_btn)

        layout.addLayout(btn_layout)

    def _create_section(self, title: str) -> QWidget:
        """创建带滚动区域的设置分组容器。"""
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setSpacing(16)

        return widget

    def _create_audio_tab(self) -> QWidget:
        widget = self._create_section("音频")
        layout = widget.layout()

        group = QGroupBox("播放设置")
        form = QFormLayout(group)

        self._volume_spin = QSpinBox()
        self._volume_spin.setRange(0, 100)
        self._volume_spin.setSuffix("%")
        form.addRow("默认音量:", self._volume_spin)

        self._output_device_combo = QComboBox()
        self._output_device_combo.addItem("系统默认", "default")
        form.addRow("输出设备:", self._output_device_combo)

        layout.addWidget(group)
        layout.addStretch()
        return widget

    def _create_lyrics_tab(self) -> QWidget:
        widget = self._create_section("歌词")
        layout = widget.layout()

        group = QGroupBox("歌词搜索")
        form = QFormLayout(group)

        self._auto_search_check = QCheckBox("自动搜索歌词")
        form.addRow("自动搜索:", self._auto_search_check)

        self._local_first_check = QCheckBox("优先使用本地歌词")
        form.addRow("本地优先:", self._local_first_check)

        self._lyrics_provider_combo = QComboBox()
        self._lyrics_provider_combo.addItems(["lrclib + 网易云", "仅 lrclib", "仅网易云"])
        form.addRow("搜索源:", self._lyrics_provider_combo)

        layout.addWidget(group)
        layout.addStretch()
        return widget

    def _create_s3_tab(self) -> QWidget:
        widget = self._create_section("S3")
        layout = widget.layout()

        group = QGroupBox("S3 / MinIO 连接配置")
        form = QFormLayout(group)

        self._s3_endpoint = QLineEdit()
        self._s3_endpoint.setPlaceholderText("例如: http://localhost:9000")
        form.addRow("Endpoint:", self._s3_endpoint)

        self._s3_access_key = QLineEdit()
        form.addRow("Access Key:", self._s3_access_key)

        self._s3_secret_key = QLineEdit()
        self._s3_secret_key.setEchoMode(QLineEdit.EchoMode.Password)
        form.addRow("Secret Key:", self._s3_secret_key)

        self._s3_bucket = QLineEdit()
        form.addRow("Bucket:", self._s3_bucket)

        self._s3_prefix = QLineEdit()
        self._s3_prefix.setPlaceholderText("music/")
        form.addRow("前缀:", self._s3_prefix)

        self._s3_region = QLineEdit()
        self._s3_region.setText("us-east-1")
        form.addRow("Region:", self._s3_region)

        self._s3_ssl_check = QCheckBox("使用 SSL")
        self._s3_ssl_check.setChecked(True)
        form.addRow("SSL:", self._s3_ssl_check)

        layout.addWidget(group)

        # 测试连接按钮
        self._s3_test_btn = QPushButton("🔌 测试连接")
        layout.addWidget(self._s3_test_btn)
        layout.addStretch()
        return widget

    def _create_openlist_tab(self) -> QWidget:
        widget = self._create_section("OpenList")
        layout = widget.layout()

        group = QGroupBox("OpenList 服务配置")
        form = QFormLayout(group)

        self._ol_server_url = QLineEdit()
        self._ol_server_url.setPlaceholderText("http://localhost:5244")
        form.addRow("服务器地址:", self._ol_server_url)

        self._ol_username = QLineEdit()
        self._ol_username.setPlaceholderText("admin")
        form.addRow("用户名:", self._ol_username)

        self._ol_password = QLineEdit()
        self._ol_password.setEchoMode(QLineEdit.EchoMode.Password)
        form.addRow("密码:", self._ol_password)

        layout.addWidget(group)

        self._ol_test_btn = QPushButton("🔌 测试连接")
        layout.addWidget(self._ol_test_btn)
        layout.addStretch()
        return widget

    def _load_settings(self) -> None:
        """从配置文件加载设置。"""
        self._volume_spin.setValue(config.get("audio.volume", 80))
        self._auto_search_check.setChecked(config.get("lyrics.auto_search", True))
        self._local_first_check.setChecked(config.get("lyrics.local_preferred", True))

        providers = config.get("lyrics.providers", ["lrclib", "netease"])
        if "lrclib" in providers and "netease" in providers:
            self._lyrics_provider_combo.setCurrentIndex(0)
        elif "lrclib" in providers:
            self._lyrics_provider_combo.setCurrentIndex(1)
        else:
            self._lyrics_provider_combo.setCurrentIndex(2)

        self._s3_endpoint.setText(config.get("s3.endpoint", ""))
        self._s3_access_key.setText(config.get("s3.access_key", ""))
        self._s3_secret_key.setText(config.get("s3.secret_key", ""))
        self._s3_bucket.setText(config.get("s3.bucket", ""))
        self._s3_prefix.setText(config.get("s3.prefix", ""))
        self._s3_region.setText(config.get("s3.region", "us-east-1"))
        self._s3_ssl_check.setChecked(config.get("s3.use_ssl", True))

        self._ol_server_url.setText(config.get("openlist.server_url", ""))
        self._ol_username.setText(config.get("openlist.username", ""))
        self._ol_password.setText(config.get("openlist.password", ""))

    def _save_settings(self) -> None:
        """保存设置到配置文件。"""
        config.set("audio.volume", self._volume_spin.value())

        config.set("lyrics.auto_search", self._auto_search_check.isChecked())
        config.set("lyrics.local_preferred", self._local_first_check.isChecked())

        provider_map = {0: ["lrclib", "netease"], 1: ["lrclib"], 2: ["netease"]}
        config.set("lyrics.providers", provider_map.get(self._lyrics_provider_combo.currentIndex(), ["lrclib", "netease"]))

        config.set("s3.endpoint", self._s3_endpoint.text())
        config.set("s3.access_key", self._s3_access_key.text())
        config.set("s3.secret_key", self._s3_secret_key.text())
        config.set("s3.bucket", self._s3_bucket.text())
        config.set("s3.prefix", self._s3_prefix.text())
        config.set("s3.region", self._s3_region.text())
        config.set("s3.use_ssl", self._s3_ssl_check.isChecked())

        config.set("openlist.server_url", self._ol_server_url.text())
        config.set("openlist.username", self._ol_username.text())
        config.set("openlist.password", self._ol_password.text())

        config.save()

        # 显示保存确认
        self._save_btn.setText("✅ 已保存")
        from PySide6.QtCore import QTimer
        QTimer.singleShot(2000, lambda: self._save_btn.setText("💾 保存设置"))
