"""暗色主题样式模块。

定义应用整体暗色主题的 QSS 样式表和调色板。
"""

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QPalette


# 主题颜色常量
COLORS = {
    "bg_darkest": "#0d1117",
    "bg_dark": "#161b22",
    "bg_medium": "#1c2333",
    "bg_light": "#21262d",
    "bg_card": "#252d3a",
    "border": "#30363d",
    "border_hover": "#484f58",
    "text_primary": "#e6edf3",
    "text_secondary": "#8b949e",
    "text_muted": "#6e7681",
    "accent": "#00d2ff",
    "accent_hover": "#00e5ff",
    "accent_dim": "#0f3460",
    "green": "#3fb950",
    "red": "#f85149",
    "orange": "#d2991d",
    "purple": "#a371f7",
    "scrollbar_bg": "#161b22",
    "scrollbar_handle": "#30363d",
    "scrollbar_handle_hover": "#484f58",
    "selection_bg": "#1f6feb44",
    "overlay": "#00000060",
}


def create_dark_palette() -> QPalette:
    """创建暗色调色板。"""
    palette = QPalette()

    palette.setColor(QPalette.ColorRole.Window, QColor(COLORS["bg_dark"]))
    palette.setColor(QPalette.ColorRole.WindowText, QColor(COLORS["text_primary"]))
    palette.setColor(QPalette.ColorRole.Base, QColor(COLORS["bg_darkest"]))
    palette.setColor(QPalette.ColorRole.AlternateBase, QColor(COLORS["bg_medium"]))
    palette.setColor(QPalette.ColorRole.ToolTipBase, QColor(COLORS["bg_card"]))
    palette.setColor(QPalette.ColorRole.ToolTipText, QColor(COLORS["text_primary"]))
    palette.setColor(QPalette.ColorRole.Text, QColor(COLORS["text_primary"]))
    palette.setColor(QPalette.ColorRole.Button, QColor(COLORS["bg_medium"]))
    palette.setColor(QPalette.ColorRole.ButtonText, QColor(COLORS["text_primary"]))
    palette.setColor(QPalette.ColorRole.BrightText, QColor(COLORS["accent"]))
    palette.setColor(QPalette.ColorRole.Link, QColor(COLORS["accent"]))
    palette.setColor(QPalette.ColorRole.Highlight, QColor(COLORS["accent_dim"]))
    palette.setColor(QPalette.ColorRole.HighlightedText, QColor(COLORS["text_primary"]))
    palette.setColor(QPalette.ColorRole.PlaceholderText, QColor(COLORS["text_muted"]))

    # 禁用状态
    palette.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.WindowText, QColor(COLORS["text_muted"]))
    palette.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.Text, QColor(COLORS["text_muted"]))
    palette.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.ButtonText, QColor(COLORS["text_muted"]))

    return palette


GLOBAL_STYLESHEET = """
/* ── 全局 ──────────────────────────────────────────── */
* {
    font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    font-size: 13px;
}

QMainWindow {
    background-color: {bg_dark};
}

/* ── 菜单栏 ────────────────────────────────────────── */
QMenuBar {{
    background-color: {bg_darkest};
    color: {text_primary};
    border-bottom: 1px solid {border};
    padding: 2px;
}}
QMenuBar::item:selected {{
    background-color: {bg_medium};
    border-radius: 4px;
}}
QMenu {{
    background-color: {bg_card};
    color: {text_primary};
    border: 1px solid {border};
    border-radius: 6px;
    padding: 4px;
}}
QMenu::item {{
    padding: 6px 28px 6px 12px;
    border-radius: 4px;
}}
QMenu::item:selected {{
    background-color: {accent_dim};
}}
QMenu::separator {{
    height: 1px;
    background: {border};
    margin: 4px 8px;
}}

/* ── 按钮 ──────────────────────────────────────────── */
QPushButton {{
    background-color: {bg_medium};
    color: {text_primary};
    border: 1px solid {border};
    border-radius: 6px;
    padding: 6px 16px;
    min-width: 28px;
}}
QPushButton:hover {{
    background-color: {bg_light};
    border-color: {border_hover};
}}
QPushButton:pressed {{
    background-color: {accent_dim};
}}
QPushButton:disabled {{
    color: {text_muted};
}}
QPushButton[flat="true"] {{
    background: transparent;
    border: none;
}}
QPushButton[accent="true"] {{
    background-color: {accent_dim};
    border-color: {accent};
    color: {accent};
}}
QPushButton[accent="true"]:hover {{
    background-color: {accent};
    color: {bg_darkest};
}}

/* ── 输入框 ────────────────────────────────────────── */
QLineEdit {{
    background-color: {bg_darkest};
    color: {text_primary};
    border: 1px solid {border};
    border-radius: 6px;
    padding: 6px 12px;
    selection-background-color: {accent_dim};
}}
QLineEdit:focus {{
    border-color: {accent};
}}

/* ── 列表/表格 ─────────────────────────────────────── */
QTableView, QListView, QTreeView {{
    background-color: {bg_darkest};
    color: {text_primary};
    border: 1px solid {border};
    border-radius: 8px;
    gridline-color: transparent;
    selection-background-color: {accent_dim};
    selection-color: {text_primary};
    alternate-background-color: {bg_medium};
    outline: none;
}}
QTableView::item, QTreeView::item {{
    padding: 4px 8px;
    border-bottom: 1px solid transparent;
}}
QTableView::item:hover, QTreeView::item:hover {{
    background-color: {bg_light};
}}
QHeaderView::section {{
    background-color: {bg_medium};
    color: {text_secondary};
    border: none;
    border-right: 1px solid {border};
    border-bottom: 1px solid {border};
    padding: 6px 10px;
    font-weight: bold;
}}

/* ── 滚动条 ────────────────────────────────────────── */
QScrollBar:vertical {{
    background: {scrollbar_bg};
    width: 8px;
    margin: 0;
    border-radius: 4px;
}}
QScrollBar::handle:vertical {{
    background: {scrollbar_handle};
    min-height: 30px;
    border-radius: 4px;
}}
QScrollBar::handle:vertical:hover {{
    background: {scrollbar_handle_hover};
}}
QScrollBar::add-line:vertical,
QScrollBar::sub-line:vertical {{
    height: 0;
}}
QScrollBar:horizontal {{
    background: {scrollbar_bg};
    height: 8px;
    margin: 0;
    border-radius: 4px;
}}
QScrollBar::handle:horizontal {{
    background: {scrollbar_handle};
    min-width: 30px;
    border-radius: 4px;
}}
QScrollBar::handle:horizontal:hover {{
    background: {scrollbar_handle_hover};
}}
QScrollBar::add-line:horizontal,
QScrollBar::sub-line:horizontal {{
    width: 0;
}}

/* ── 滑动条 ────────────────────────────────────────── */
QSlider::groove:horizontal {{
    background: {bg_light};
    height: 4px;
    border-radius: 2px;
}}
QSlider::handle:horizontal {{
    background: {accent};
    width: 14px;
    height: 14px;
    margin: -5px 0;
    border-radius: 7px;
}}
QSlider::handle:horizontal:hover {{
    background: {accent_hover};
}}
QSlider::sub-page:horizontal {{
    background: {accent};
    border-radius: 2px;
}}

QSlider::groove:vertical {{
    background: {bg_light};
    width: 4px;
    border-radius: 2px;
}}
QSlider::handle:vertical {{
    background: {accent};
    width: 14px;
    height: 14px;
    margin: 0 -5px;
    border-radius: 7px;
}}

/* ── 标签页 ────────────────────────────────────────── */
QTabWidget::pane {{
    background-color: {bg_darkest};
    border: 1px solid {border};
    border-radius: 8px;
}}
QTabBar::tab {{
    background-color: {bg_medium};
    color: {text_secondary};
    border: none;
    padding: 8px 20px;
    margin-right: 2px;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
}}
QTabBar::tab:selected {{
    background-color: {bg_darkest};
    color: {accent};
}}
QTabBar::tab:hover {{
    background-color: {bg_light};
}}

/* ── 进度条 ────────────────────────────────────────── */
QProgressBar {{
    background-color: {bg_medium};
    border: none;
    border-radius: 4px;
    height: 6px;
    text-align: center;
    color: {text_primary};
}}
QProgressBar::chunk {{
    background-color: {accent};
    border-radius: 4px;
}}

/* ── 分组框 ────────────────────────────────────────── */
QGroupBox {{
    color: {text_primary};
    border: 1px solid {border};
    border-radius: 8px;
    margin-top: 12px;
    padding: 12px;
    font-weight: bold;
}}
QGroupBox::title {{
    subcontrol-origin: margin;
    left: 12px;
    padding: 0 6px;
}}

/* ── 标签 ──────────────────────────────────────────── */
QLabel {{
    color: {text_primary};
}}

/* ── 复选框/单选框 ──────────────────────────────────── */
QCheckBox, QRadioButton {{
    color: {text_primary};
    spacing: 8px;
}}
QCheckBox::indicator {{
    width: 16px;
    height: 16px;
    border: 2px solid {border};
    border-radius: 3px;
    background: {bg_darkest};
}}
QCheckBox::indicator:checked {{
    background: {accent};
    border-color: {accent};
}}

/* ── 组合框 ────────────────────────────────────────── */
QComboBox {{
    background-color: {bg_darkest};
    color: {text_primary};
    border: 1px solid {border};
    border-radius: 6px;
    padding: 6px 12px;
    min-width: 80px;
}}
QComboBox:hover {{
    border-color: {border_hover};
}}
QComboBox::drop-down {{
    border: none;
    width: 24px;
}}
QComboBox QAbstractItemView {{
    background-color: {bg_card};
    color: {text_primary};
    border: 1px solid {border};
    border-radius: 4px;
    selection-background-color: {accent_dim};
    outline: none;
}}

/* ── 分割线 ────────────────────────────────────────── */
QFrame[frameShape="4"], QFrame[frameShape="5"] {{
    color: {border};
}}

/* ── 工具提示 ──────────────────────────────────────── */
QToolTip {{
    background-color: {bg_card};
    color: {text_primary};
    border: 1px solid {border};
    border-radius: 4px;
    padding: 4px 8px;
}}

/* ── 侧边栏导航按钮 ────────────────────────────────── */
QPushButton[nav="true"] {{
    background: transparent;
    border: none;
    border-radius: 8px;
    text-align: left;
    padding: 10px 16px;
    font-size: 14px;
    color: {text_secondary};
}}
QPushButton[nav="true"]:hover {{
    background-color: {bg_light};
    color: {text_primary};
}}
QPushButton[nav="true"][active="true"] {{
    background-color: {accent_dim};
    color: {accent};
}}
""".format(**COLORS)
