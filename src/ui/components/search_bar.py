"""搜索栏组件。"""

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLineEdit,
    QPushButton,
    QWidget,
)


class SearchBar(QWidget):
    """带清除按钮的搜索框。

    Signals:
        search_requested(str): 用户按下回车或点击搜索时触发
        text_changed(str): 输入文本变化时触发
    """

    search_requested = Signal(str)
    text_changed = Signal(str)

    def __init__(self, placeholder: str = "搜索音乐...", parent=None) -> None:
        super().__init__(parent)
        self._setup_ui(placeholder)

    def _setup_ui(self, placeholder: str) -> None:
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        # 搜索图标
        self._icon_label = QPushButton("🔍")
        self._icon_label.setFlat(True)
        self._icon_label.setFixedSize(32, 32)
        self._icon_label.setCursor(Qt.CursorShape.PointingHandCursor)
        self._icon_label.setStyleSheet("font-size: 16px;")

        # 搜索输入框
        self._input = QLineEdit()
        self._input.setPlaceholderText(placeholder)
        self._input.setClearButtonEnabled(True)
        self._input.setMinimumHeight(32)

        # 连接信号
        self._input.returnPressed.connect(self._on_search)
        self._input.textChanged.connect(self._on_text_changed)
        self._icon_label.clicked.connect(self._on_search)

        layout.addWidget(self._icon_label)
        layout.addWidget(self._input)

    def _on_search(self) -> None:
        text = self._input.text().strip()
        self.search_requested.emit(text)

    def _on_text_changed(self, text: str) -> None:
        self.text_changed.emit(text)

    def text(self) -> str:
        return self._input.text()

    def set_text(self, text: str) -> None:
        self._input.setText(text)

    def clear(self) -> None:
        self._input.clear()
