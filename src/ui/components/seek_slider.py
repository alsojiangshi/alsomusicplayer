"""自定义进度/Seek 滑动条组件。"""

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QSlider, QStyle


class SeekSlider(QSlider):
    """带悬停预览和点击跳转功能的进度条。

    Signals:
        seek_requested(int): 用户请求跳转到指定位置（毫秒）
    """

    seek_requested = Signal(int)

    def __init__(self, parent=None) -> None:
        super().__init__(Qt.Orientation.Horizontal, parent)
        self.setRange(0, 0)
        self.setTracking(True)
        self._is_seeking = False

    def mousePressEvent(self, event) -> None:
        """点击时直接跳转到对应位置。"""
        self._is_seeking = True
        if self.maximum() > 0:
            value = QStyle.sliderValueFromPosition(
                self.minimum(), self.maximum(),
                event.position().toPoint().x(), self.width()
            )
            self.setValue(value)
            self.seek_requested.emit(value)
        super().mousePressEvent(event)

    def mouseReleaseEvent(self, event) -> None:
        self._is_seeking = False
        super().mouseReleaseEvent(event)

    def set_duration_ms(self, duration_ms: int) -> None:
        """设置滑动条范围（以毫秒计的总时长）。"""
        self.setRange(0, duration_ms)

    @property
    def is_seeking(self) -> bool:
        """用户是否正在拖动进度条。"""
        return self._is_seeking
