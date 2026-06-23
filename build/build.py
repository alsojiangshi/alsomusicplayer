#!/usr/bin/env python3
"""MusicPlayer 构建脚本 — 生成 6 种便携版产物。

用法:
    python build/build.py              # 构建当前平台所有变体
    python build/build.py --linux      # 仅构建 Linux 版本
    python build/build.py --windows    # 仅构建 Windows 版本
    python build/build.py --variant gui  # 仅构建特定变体

产物 (×2 平台):
    dist/linux/
      MusicPlayer-cli-linux          — CLI/TUI 终端版 (pygame)
      MusicPlayer-gui-linux           — GUI 图形界面版 (PySide6)
      MusicPlayer-full-linux          — CLI + GUI 合一版
    dist/windows/
      MusicPlayer-cli-windows.exe
      MusicPlayer-gui-windows.exe
      MusicPlayer-full-windows.exe
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = PROJECT_ROOT / "src"
DIST_DIR = PROJECT_ROOT / "dist"
BUILD_WORK_DIR = PROJECT_ROOT / "build" / "_work"

SHARED_HIDDEN = [
    "mutagen", "mutagen.mp3", "mutagen.flac", "mutagen.oggvorbis",
    "mutagen.mp4", "mutagen.wave", "mutagen.id3",
    "boto3", "botocore", "requests", "PIL", "sqlite3",
]

GUI_HIDDEN = [
    "PySide6.QtMultimedia", "PySide6.QtMultimediaWidgets",
    "PySide6.QtGui", "PySide6.QtWidgets", "PySide6.QtCore",
    "PySide6.QtNetwork",
]

CLI_HIDDEN = [
    "textual", "textual.app", "textual.widgets",
    "textual.containers", "textual.binding", "textual.screen",
    "textual.css", "textual.events",
    "rich", "markdown_it",
    "pygame", "pygame.mixer", "pygame.event", "pygame.locals",
]

VARIANTS = {
    "cli": {
        "entry": "src/main_cli.py",
        "name_tpl": "MusicPlayer-cli-{platform}",
        "console": True,
        "desc": "CLI/TUI 终端版 (pygame + textual)",
        "hidden": SHARED_HIDDEN + CLI_HIDDEN,
    },
    "gui": {
        "entry": "src/main_gui.py",
        "name_tpl": "MusicPlayer-gui-{platform}",
        "console": False,
        "desc": "GUI 图形界面版 (PySide6)",
        "hidden": SHARED_HIDDEN + GUI_HIDDEN,
    },
    "full": {
        "entry": "src/main.py",
        "name_tpl": "MusicPlayer-full-{platform}",
        "console": False,
        "desc": "CLI + GUI 合一版",
        "hidden": SHARED_HIDDEN + GUI_HIDDEN + CLI_HIDDEN,
    },
}


def is_windows_host() -> bool:
    return os.name == "nt"


def collect_datas() -> list[str]:
    """收集 --add-data 参数。"""
    args = []
    # 添加 styles.tcss（CLI 需要）
    tcss = SRC_DIR / "cli" / "styles.tcss"
    if tcss.exists():
        args.extend(["--add-data", f"{tcss}{os.pathsep}src/cli"])
    return args


def build_variant(variant_key: str, platform: str) -> bool:
    """构建单个变体。"""
    if platform == "windows" and not is_windows_host():
        print(f"  ⚠️  跳过 Windows 构建（当前非 Windows，CI 自动处理）")
        return False
    if platform == "linux" and is_windows_host():
        print(f"  ⚠️  跳过 Linux 构建（当前为 Windows）")
        return False

    config = VARIANTS[variant_key]
    entry = str(PROJECT_ROOT / config["entry"])
    suffix = ".exe" if platform == "windows" else ""
    name = config["name_tpl"].format(platform=platform) + suffix
    work_dir = BUILD_WORK_DIR / f"{platform}-{variant_key}"
    dist_dir = DIST_DIR / platform

    # 确保输出目录干净
    if work_dir.exists():
        shutil.rmtree(work_dir, ignore_errors=True)

    print(f"\n{'='*60}")
    print(f"🔨 {config['desc']} ({platform})")
    print(f"   入口: {config['entry']}")
    print(f"   产物: {dist_dir / name}")
    print(f"{'='*60}")

    # 收集隐藏导入
    hidden_args = []
    for imp in config["hidden"]:
        hidden_args.extend(["--hidden-import", imp])

    # 收集数据文件
    datas = collect_datas()

    cmd = [
        sys.executable, "-m", "PyInstaller",
        entry,
        "--name", name.replace(suffix, ""),
        "--distpath", str(dist_dir),
        "--workpath", str(work_dir),
        "--specpath", str(BUILD_WORK_DIR),
        "--paths", str(PROJECT_ROOT),
        "--noconfirm",
        "--strip",
        "--log-level", "WARN",
    ] + hidden_args + datas

    if not config["console"]:
        cmd.append("--windowed")

    env = os.environ.copy()
    env["PYTHONPATH"] = str(PROJECT_ROOT)

    print(f"   PyInstaller 参数数: {len(cmd)}")
    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT), env=env,
                            capture_output=True, text=True)

    if result.returncode == 0:
        exe_path = dist_dir / name
        size_mb = exe_path.stat().st_size / (1024*1024) if exe_path.exists() else 0
        print(f"  ✅ 构建成功 ({size_mb:.1f} MB)")
        return True
    else:
        # 打印完整错误输出
        print(f"  ❌ 构建失败 (exit: {result.returncode})")
        print(f"  ── STDOUT ──")
        for line in result.stdout.split("\n")[-30:]:
            if line.strip():
                print(f"  | {line}")
        print(f"  ── STDERR ──")
        for line in result.stderr.split("\n")[-30:]:
            if line.strip():
                print(f"  | {line}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="MusicPlayer 便携版构建工具")
    parser.add_argument("--linux", action="store_true")
    parser.add_argument("--windows", action="store_true")
    parser.add_argument("--variant", choices=["cli", "gui", "full"])
    args = parser.parse_args()

    platforms = ["linux"] if args.linux else (["windows"] if args.windows else
                 (["linux"] if not is_windows_host() else ["windows"]))
    variants = [args.variant] if args.variant else list(VARIANTS.keys())

    print(f"\n🎵 MusicPlayer 构建系统")
    print(f"   平台: {', '.join(platforms)}")
    print(f"   变体: {', '.join(variants)}")
    print(f"   PyInstaller: {sys.executable}")

    success = 0
    total = len(platforms) * len(variants)
    for p in platforms:
        for v in variants:
            if build_variant(v, p):
                success += 1

    print(f"\n{'='*60}")
    print(f"📦 完成: {success}/{total}")
    print(f"   输出: {DIST_DIR}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
