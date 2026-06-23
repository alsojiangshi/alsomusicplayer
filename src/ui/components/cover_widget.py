"""专辑封面展示组件。"""

from PySide6.QtCore import Qt, QSize
from PySide6.QtGui import QImage, QPixmap
from PySide6.QtWidgets import QLabel, QSizePolicy, QVBoxLayout, QWidget

from ...utils.file_utils import format_duration


class CoverWidget(QWidget):
    """展示专辑封面的组件，包含旋转动画支持。

    支持有/无封面的情况，无封面时显示音乐图标占位。
    """

    def __init__(self, size: int = 200, parent=None) -> None:
        super().__init__(parent)
        self._cover_size = size
        self._setup_ui()

    def _setup_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self._cover_label = QLabel()
        self._cover_label.setFixedSize(self._cover_size, self._cover_size)
        self._cover_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._cover_label.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self._set_placeholder()

        layout.addWidget(self._cover_label)

    def _set_placeholder(self) -> None:
        """设置占位图标（无封面时显示）。"""
        self._cover_label.setText("🎵")
        self._cover_label.setStyleSheet(f"""
            QLabel {{
                font-size: {self._cover_size // 2}px;
                border-radius: {self._cover_size // 6}px;
                background-color: #1c2333;
                border: 2px solid #30363d;
            }}
        """)

    def set_cover(self, image_data: bytes | None) -> None:
        """设置封面图片。

        Args:
            image_data: 图片二进制数据，None 时显示占位符。
        """
        if image_data is None:
            self._set_placeholder()
            return

        image = QImage()
        if image.loadFromData(image_data):
            pixmap = QPixmap.fromImage(image)
            scaled = pixmap.scaled(
                self._cover_size, self._cover_size,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )
            self._cover_label.setPixmap(scaled)
            self._cover_label.setStyleSheet(f"""
                QLabel {{
                    border-radius: {self._cover_size // 6}px;
                }}
            """)

    def set_default_cover(self, artist: str = "", album: str = "") -> None:
        """根据艺术家/专辑信息生成缺省封面文字。"""
        text = artist[:1] or album[:1] or "?"
        self._cover_label.setText(text.upper())
        self._cover_label.setStyleSheet(f"""
            QLabel {{
                font-size: {self._cover_size // 3}px;
                font-weight: bold;
                color: #00d2ff;
                border-radius: {self._cover_size // 6}px;
                background-color: #0f3460;
                border: 2px solid #00d2ff44;
            }}
        """)
