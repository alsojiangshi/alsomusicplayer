# MusicPlayer Makefile
# 构建和管理命令

.PHONY: help run test clean build-linux build-windows install-deps init

PYTHON := python3
PIP := pip3
SRC := src/

help:  ## 显示帮助信息
	@echo "MusicPlayer - 跨平台轻量音乐播放器"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install-deps:  ## 安装 Python 依赖
	$(PIP) install -r requirements.txt --break-system-packages

init: install-deps  ## 初始化项目（安装依赖+创建目录）
	@mkdir -p resources/icons resources/fonts

run:  ## 运行应用
	cd .. && $(PYTHON) -m src.main

test:  ## 运行测试
	$(PYTHON) -m pytest tests/ -v

clean:  ## 清理构建文件
	rm -rf build/ dist/ __pycache__/
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.spec" -not -path "./build/*" -delete

clean-cache:  ## 清理应用缓存和数据
	rm -rf ~/.config/music-player/
	rm -rf ~/.local/share/music-player/

build-linux: clean  ## 构建 Linux 便携版
	pyinstaller build/linux.spec --distpath dist/linux --workpath build/linux-work
	@echo ""
	@echo "✅ Linux 便携版: dist/linux/MusicPlayer"

build-windows: clean  ## 构建 Windows 便携版 (必须在 Windows 上运行)
ifeq ($(OS),Windows_NT)
	pyinstaller build/windows.spec --distpath dist/windows --workpath build/windows-work
	@echo ""
	@echo "✅ Windows 便携版: dist/windows/MusicPlayer.exe"
else
	$(error ❌ Linux→Windows 交叉编译不可行。请在 Windows 机器上运行此命令，或使用 CI:<NEWLINE>    git tag v1.0.0 && git push --tags<NEWLINE>    详见 .github/workflows/build.yml)
endif

build-all: build-linux  ## 构建所有平台（当前平台）
	@echo "✅ 所有平台构建完成"

# 代码质量
lint:  ## 代码检查
	ruff check $(SRC) --fix
	ruff format $(SRC) --check

format:  ## 格式化代码
	ruff format $(SRC)

# 开发辅助
dev:  ## 启动开发模式（带热重载）
	$(PYTHON) -m src.main

shell:  ## 打开 Python 交互式 shell
	$(PYTHON) -c "from src.database import db; db.initialize(); print('数据库已初始化')"
	$(PYTHON)
