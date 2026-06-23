"""应用配置管理模块。

管理用户配置的加载、保存和默认值。
配置以 JSON 格式存储在用户数据目录中。
"""

import json
import os
from pathlib import Path
from typing import Any


# 默认配置
DEFAULT_CONFIG: dict[str, Any] = {
    "app": {
        "name": "MusicPlayer",
        "version": "1.0.0",
        "language": "zh_CN",
        "check_update": False,
    },
    "audio": {
        "volume": 80,
        "muted": False,
        "output_device": "default",
        "playback_mode": "sequential",  # sequential | shuffle | repeat_one | repeat_all
    },
    "library": {
        "music_dirs": [],
        "watch_dirs": False,
        "auto_scan_interval": 0,
    },
    "lyrics": {
        "auto_search": True,
        "providers": ["lrclib", "netease"],
        "local_preferred": True,
        "save_locally": True,
    },
    "s3": {
        "endpoint": "",
        "access_key": "",
        "secret_key": "",
        "bucket": "",
        "prefix": "",
        "region": "us-east-1",
        "use_ssl": True,
        "cache_dir": "",
    },
    "openlist": {
        "server_url": "",
        "username": "",
        "password": "",
        "cache_dir": "",
    },
    "ui": {
        "theme": "dark",
        "accent_color": "#00d2ff",
        "show_cover_art": True,
        "font_size": 13,
        "language": "zh_CN",
    },
    "shortcuts": {
        "play_pause": "Space",
        "next": "Ctrl+Right",
        "prev": "Ctrl+Left",
        "volume_up": "Ctrl+Up",
        "volume_down": "Ctrl+Down",
        "mute": "Ctrl+M",
        "search": "Ctrl+F",
        "import": "Ctrl+I",
    },
}


def _get_config_dir() -> Path:
    """获取配置文件目录。"""
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    config_dir = base / "music-player"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


def _get_data_dir() -> Path:
    """获取数据目录（数据库、缓存等）。"""
    if os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    data_dir = base / "music-player"
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


class Config:
    """配置管理单例。"""

    _instance: "Config | None" = None

    def __new__(cls) -> "Config":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if hasattr(self, "_initialized"):
            return
        self._initialized = True
        self._config_dir = _get_config_dir()
        self._data_dir = _get_data_dir()
        self._config_path = self._config_dir / "config.json"
        self._data: dict[str, Any] = {}
        self.load()

    @property
    def config_dir(self) -> Path:
        return self._config_dir

    @property
    def data_dir(self) -> Path:
        return self._data_dir

    @property
    def db_path(self) -> str:
        return str(self._data_dir / "music.db")

    @property
    def cover_cache_dir(self) -> Path:
        cache = self._data_dir / "covers"
        cache.mkdir(parents=True, exist_ok=True)
        return cache

    def load(self) -> None:
        """从文件加载配置，缺失的键使用默认值。"""
        self._data = _deep_merge(DEFAULT_CONFIG, {})
        if self._config_path.exists():
            try:
                with open(self._config_path, "r", encoding="utf-8") as f:
                    user_config = json.load(f)
                self._data = _deep_merge(self._data, user_config)
            except (json.JSONDecodeError, IOError):
                pass

    def save(self) -> None:
        """保存配置到文件。"""
        with open(self._config_path, "w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=2, ensure_ascii=False)

    def get(self, key_path: str, default: Any = None) -> Any:
        """通过点号分隔的路径获取配置值。

        例如 config.get("audio.volume") 返回音量设置。
        """
        keys = key_path.split(".")
        value = self._data
        for key in keys:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return default
        return value

    def set(self, key_path: str, value: Any) -> None:
        """通过点号分隔的路径设置配置值。"""
        keys = key_path.split(".")
        target = self._data
        for key in keys[:-1]:
            if key not in target:
                target[key] = {}
            target = target[key]
        target[keys[-1]] = value
        self.save()

    def get_all(self) -> dict[str, Any]:
        return self._data

    def reset(self) -> None:
        """重置为默认配置。"""
        self._data = _deep_merge(DEFAULT_CONFIG, {})
        self.save()


def _deep_merge(base: dict, override: dict) -> dict:
    """深度合并两个字典，override 的值覆盖 base。"""
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


# 全局配置实例
config = Config()
