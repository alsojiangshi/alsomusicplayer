# MusicPlayer Makefile

.PHONY: help run run-cli run-gui test clean build build-linux build-all

PYTHON := python3
SRC := src/

help:  ## 显示帮助
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install-deps:  ## 安装 Python 依赖
	pip install -r requirements.txt --break-system-packages

# ── 运行 ────────────────────────────────────────────────
run:  ## 运行（自动选择 GUI/CLI）
	PYTHONPATH=. $(PYTHON) src/main.py

run-gui:  ## 运行 GUI 模式
	PYTHONPATH=. $(PYTHON) src/main.py --gui

run-cli:  ## 运行 CLI/TUI 模式
	PYTHONPATH=. $(PYTHON) src/main.py --cli

# ── 测试 ────────────────────────────────────────────────
test:  ## 运行单元测试
	PYTHONPATH=. $(PYTHON) -m unittest discover -s tests -v

# ── 构建 ────────────────────────────────────────────────
build:  ## 构建当前平台所有变体 (3个)
	$(PYTHON) build/build.py

build-linux:  ## 仅构建 Linux 变体
	$(PYTHON) build/build.py --linux

build-cli:  ## 仅构建 CLI 变体
	$(PYTHON) build/build.py --variant cli

build-gui:  ## 仅构建 GUI 变体
	$(PYTHON) build/build.py --variant gui

build-full:  ## 仅构建合一版
	$(PYTHON) build/build.py --variant full

# ── 清理 ────────────────────────────────────────────────
clean:  ## 清理构建文件
	rm -rf dist/ build/_work/ *.spec
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete

clean-cache:  ## 清理应用缓存
	rm -rf ~/.config/music-player/
	rm -rf ~/.local/share/music-player/
