"""多源导入对话框。

支持从本地文件、S3/MinIO 和 OpenList 导入音乐文件。
"""

import os
from typing import Optional

from PySide6.QtCore import Qt, QThreadPool, Signal
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QSpinBox,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from ..config import config
from ..core.library_manager import LibraryManager
from ..importers.local_importer import LocalImporter
from ..importers.s3_importer import S3Importer
from ..importers.openlist_importer import OpenListImporter
from ..utils.metadata import scan_directory
from ..utils.workers import Worker


class ImportDialog(QDialog):
    """多源音乐导入对话框。

    Signals:
        import_completed: 导入完成信号
    """

    import_completed = Signal()

    def __init__(
        self,
        library_manager: LibraryManager,
        parent=None,
    ) -> None:
        super().__init__(parent)
        self._library = library_manager
        self._local_importer = LocalImporter(library_manager)
        self._s3_importer = S3Importer(library_manager)
        self._openlist_importer = OpenListImporter(library_manager)

        self.setWindowTitle("导入音乐")
        self.setMinimumSize(560, 480)
        self.setStyleSheet(parent.styleSheet() if parent else "")

        self._setup_ui()
        self._connect_signals()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setSpacing(16)

        # ── 导入源选择 ────────────────────────────────────
        source_layout = QHBoxLayout()
        source_layout.addWidget(QLabel("导入来源:"))

        self._source_combo = QComboBox()
        self._source_combo.addItem("📁 本地文件/文件夹", "local")
        self._source_combo.addItem("☁️ S3 / MinIO 存储", "s3")
        self._source_combo.addItem("📋 OpenList 服务", "openlist")
        source_layout.addWidget(self._source_combo, stretch=1)
        layout.addLayout(source_layout)

        # ── 导入源配置面板（堆叠） ─────────────────────────
        self._stack = QStackedWidget()
        self._stack.addWidget(self._create_local_panel())
        self._stack.addWidget(self._create_s3_panel())
        self._stack.addWidget(self._create_openlist_panel())
        layout.addWidget(self._stack)

        # ── 进度条 ────────────────────────────────────────
        self._progress_bar = QProgressBar()
        self._progress_bar.setVisible(False)
        layout.addWidget(self._progress_bar)

        self._status_label = QLabel("")
        self._status_label.setStyleSheet("color: #8b949e; font-size: 12px;")
        self._status_label.setVisible(False)
        layout.addWidget(self._status_label)

        # ── 按钮 ──────────────────────────────────────────
        btn_layout = QHBoxLayout()
        btn_layout.addStretch()

        self._cancel_btn = QPushButton("取消")
        self._cancel_btn.clicked.connect(self.reject)
        btn_layout.addWidget(self._cancel_btn)

        self._import_btn = QPushButton("开始导入")
        self._import_btn.setProperty("accent", True)
        btn_layout.addWidget(self._import_btn)

        layout.addLayout(btn_layout)

    def _create_local_panel(self) -> QWidget:
        """创建本地文件导入面板。"""
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setSpacing(12)

        # 拖拽提示
        hint = QLabel("📂 拖拽文件/文件夹到此处，或点击下方按钮选择")
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        hint.setStyleSheet("""
            QLabel {
                border: 2px dashed #30363d;
                border-radius: 12px;
                padding: 32px;
                color: #8b949e;
                font-size: 14px;
            }
        """)
        hint.setAcceptDrops(True)
        layout.addWidget(hint)

        # 已选文件列表
        self._local_file_list = QListWidget()
        self._local_file_list.setMaximumHeight(120)
        layout.addWidget(self._local_file_list)

        # 按钮行
        btn_layout = QHBoxLayout()
        self._add_files_btn = QPushButton("📁 添加文件")
        self._add_folder_btn = QPushButton("📂 添加文件夹")
        btn_layout.addWidget(self._add_files_btn)
        btn_layout.addWidget(self._add_folder_btn)
        btn_layout.addStretch()
        layout.addLayout(btn_layout)

        return widget

    def _create_s3_panel(self) -> QWidget:
        """创建 S3 导入面板。"""
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setSpacing(12)

        group = QGroupBox("S3 连接信息")
        form = QFormLayout(group)

        self._s3_endpoint_label = QLabel(config.get("s3.endpoint", "未配置"))
        form.addRow("Endpoint:", self._s3_endpoint_label)

        self._s3_bucket_label = QLabel(config.get("s3.bucket", "未配置"))
        form.addRow("Bucket:", self._s3_bucket_label)

        self._s3_prefix_label = QLabel(config.get("s3.prefix", "无"))
        form.addRow("前缀:", self._s3_prefix_label)

        layout.addWidget(group)

        # 最大导入数
        count_layout = QHBoxLayout()
        count_layout.addWidget(QLabel("最大导入数:"))
        self._s3_max_count = QSpinBox()
        self._s3_max_count.setRange(1, 10000)
        self._s3_max_count.setValue(500)
        count_layout.addWidget(self._s3_max_count)
        count_layout.addStretch()
        layout.addLayout(count_layout)

        layout.addStretch()
        return widget

    def _create_openlist_panel(self) -> QWidget:
        """创建 OpenList 导入面板。"""
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setSpacing(12)

        group = QGroupBox("OpenList 连接信息")
        form = QFormLayout(group)

        self._ol_url_label = QLabel(config.get("openlist.server_url", "未配置"))
        form.addRow("服务器:", self._ol_url_label)

        self._ol_user_label = QLabel(config.get("openlist.username", "未配置"))
        form.addRow("用户:", self._ol_user_label)

        layout.addWidget(group)

        # 路径
        path_layout = QHBoxLayout()
        path_layout.addWidget(QLabel("远程路径:"))
        self._ol_path = QLineEdit("/")
        path_layout.addWidget(self._ol_path, stretch=1)
        layout.addLayout(path_layout)

        layout.addStretch()
        return widget

    def _connect_signals(self) -> None:
        self._source_combo.currentIndexChanged.connect(self._stack.setCurrentIndex)
        self._import_btn.clicked.connect(self._start_import)

        self._add_files_btn.clicked.connect(self._add_local_files)
        self._add_folder_btn.clicked.connect(self._add_local_folder)

    def _add_local_files(self) -> None:
        files, _ = QFileDialog.getOpenFileNames(
            self, "选择音乐文件", "",
            "音频文件 (*.mp3 *.flac *.wav *.ogg *.m4a *.aac *.opus *.wma);;所有文件 (*)"
        )
        for f in files:
            if f not in [self._local_file_list.item(i).text() for i in range(self._local_file_list.count())]:
                self._local_file_list.addItem(QListWidgetItem(f))

    def _add_local_folder(self) -> None:
        folder = QFileDialog.getExistingDirectory(self, "选择文件夹")
        if folder:
            files = scan_directory(folder, recursive=True)
            for f in files:
                existing = [self._local_file_list.item(i).text() for i in range(self._local_file_list.count())]
                if f not in existing:
                    self._local_file_list.addItem(QListWidgetItem(f))

    def _start_import(self) -> None:
        """启动导入任务。"""
        source = self._source_combo.currentData()

        if source == "local":
            files = [self._local_file_list.item(i).text() for i in range(self._local_file_list.count())]
            if not files:
                QMessageBox.warning(self, "提示", "请先添加要导入的文件或文件夹。")
                return
            self._run_import(self._local_importer.import_files, files)

        elif source == "s3":
            self._run_import(
                self._s3_importer.import_from_s3,
                config.get("s3.endpoint", ""),
                config.get("s3.access_key", ""),
                config.get("s3.secret_key", ""),
                config.get("s3.bucket", ""),
                config.get("s3.prefix", ""),
                config.get("s3.region", "us-east-1"),
                config.get("s3.use_ssl", True),
                self._s3_max_count.value(),
            )

        elif source == "openlist":
            self._run_import(
                self._openlist_importer.import_from_openlist,
                config.get("openlist.server_url", ""),
                config.get("openlist.username", ""),
                config.get("openlist.password", ""),
                self._ol_path.text() or "/",
            )

    def _run_import(self, fn, *args) -> None:
        """在后台线程中运行导入任务。"""
        self._import_btn.setEnabled(False)
        self._progress_bar.setVisible(True)
        self._progress_bar.setValue(0)
        self._status_label.setVisible(True)

        worker = Worker(fn, *args)
        worker.signals.result.connect(self._on_import_done)
        worker.signals.error.connect(self._on_import_error)
        QThreadPool.globalInstance().start(worker)

    def _on_import_done(self, result) -> None:
        """导入完成处理。"""
        count = result if isinstance(result, int) else len(result) if isinstance(result, list) else 0
        self._progress_bar.setValue(100)
        self._status_label.setText(f"✅ 成功导入 {count} 首歌曲")
        self.import_completed.emit()

        self._import_btn.setEnabled(True)

        # 延迟关闭
        from PySide6.QtCore import QTimer
        QTimer.singleShot(1500, self.accept)

    def _on_import_error(self, error_msg: str) -> None:
        """导入错误处理。"""
        self._status_label.setText(f"❌ 导入失败: {error_msg}")
        self._import_btn.setEnabled(True)
        QMessageBox.critical(self, "导入错误", error_msg)
