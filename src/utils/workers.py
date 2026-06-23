"""后台工作线程模块。

提供 QThread 和 QRunnable 封装，用于在后台执行耗时操作，
避免阻塞 UI 主线程。
"""

import traceback
from typing import Any, Callable, Optional

from PySide6.QtCore import (
    QObject,
    QRunnable,
    QThread,
    QThreadPool,
    Signal,
    Slot,
)


class WorkerSignals(QObject):
    """Worker 信号集合。"""

    started = Signal()
    finished = Signal()
    progress = Signal(int, str)  # 进度百分比, 状态信息
    result = Signal(object)       # 成功结果
    error = Signal(str)           # 错误信息


class Worker(QRunnable):
    """后台任务 Worker。

    用法:
        worker = Worker(my_function, arg1, arg2)
        worker.signals.result.connect(on_result)
        worker.signals.error.connect(on_error)
        QThreadPool.globalInstance().start(worker)
    """

    def __init__(self, fn: Callable, *args: Any, **kwargs: Any) -> None:
        super().__init__()
        self.fn = fn
        self.args = args
        self.kwargs = kwargs
        self.signals = WorkerSignals()
        self._cancelled = False

    def cancel(self) -> None:
        """请求取消任务。任务需要自行检查 is_cancelled。"""
        self._cancelled = True

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled

    @Slot()
    def run(self) -> None:
        """在线程池中执行任务。"""
        try:
            self.signals.started.emit()
            result = self.fn(*self.args, **self.kwargs)
            if not self._cancelled:
                self.signals.result.emit(result)
        except Exception as e:
            if not self._cancelled:
                self.signals.error.emit(f"{e}\n{traceback.format_exc()}")
        finally:
            self.signals.finished.emit()


class ProgressWorker(Worker):
    """带进度报告的后台 Worker。

    被调用的函数应接受 progress_callback(percent, message) 参数。
    """

    def __init__(self, fn: Callable, *args: Any, **kwargs: Any) -> None:
        super().__init__(fn, *args, **kwargs)
        self.fn = fn
        self.args = args
        self.kwargs = kwargs

    @Slot()
    def run(self) -> None:
        try:
            self.signals.started.emit()

            def progress_cb(percent: int, message: str = "") -> None:
                if not self._cancelled:
                    self.signals.progress.emit(percent, message)

            self.kwargs["progress_callback"] = progress_cb
            result = self.fn(*self.args, **self.kwargs)

            if not self._cancelled:
                self.signals.result.emit(result)
        except Exception as e:
            if not self._cancelled:
                self.signals.error.emit(f"{e}\n{traceback.format_exc()}")
        finally:
            self.signals.finished.emit()


class ThreadWorker(QObject):
    """基于 QThread 的长时间任务 Worker。

    适用于需要与 QThread 更紧密集成的场景。
    """

    started = Signal()
    finished = Signal()
    progress = Signal(int, str)
    result = Signal(object)
    error = Signal(str)

    def __init__(self, parent: Optional[QObject] = None) -> None:
        super().__init__(parent)
        self._thread: Optional[QThread] = None
        self._fn: Optional[Callable] = None
        self._args: tuple = ()
        self._kwargs: dict = {}
        self._cancelled = False

    def setup(self, fn: Callable, *args: Any, **kwargs: Any) -> None:
        """配置要执行的任务。"""
        self._fn = fn
        self._args = args
        self._kwargs = kwargs

    def start(self) -> None:
        """在新线程中启动任务。"""
        if self._fn is None:
            return
        self._thread = QThread()
        self.moveToThread(self._thread)
        self._thread.started.connect(self._run)
        self._thread.finished.connect(self._thread.deleteLater)
        self._thread.finished.connect(self.deleteLater)
        self._thread.start()
        self.started.emit()

    def cancel(self) -> None:
        self._cancelled = True

    @Slot()
    def _run(self) -> None:
        try:
            if self._fn:
                result = self._fn(*self._args, **self._kwargs)
                if not self._cancelled:
                    self.result.emit(result)
        except Exception as e:
            if not self._cancelled:
                self.error.emit(str(e))
        finally:
            self.finished.emit()
            if self._thread:
                self._thread.quit()


def run_in_thread(fn: Callable, *args: Any, **kwargs: Any) -> Worker:
    """便捷函数：在线程池中运行任务。"""
    worker = Worker(fn, *args, **kwargs)
    QThreadPool.globalInstance().start(worker)
    return worker
