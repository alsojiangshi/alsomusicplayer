"""LRCLIB.net 歌词提供者。

LRCLIB (https://lrclib.net) 是一个免费、公开的歌词数据库。
无需 API Key，支持搜索和获取同步/非同步歌词。

API 端点：
- GET /api/search?q=keyword&track_name=X&artist_name=X
- GET /api/get/{id}
- GET /api/get?track_name=X&artist_name=X&album_name=X&duration=X
"""

from typing import Optional
from urllib.parse import urlencode

import requests

from .base import LyricsProvider


class LRCLibProvider(LyricsProvider):
    """LRCLIB.net 歌词提供者。"""

    BASE_URL = "https://lrclib.net/api"

    @property
    def name(self) -> str:
        return "lrclib"

    def search(
        self,
        title: str,
        artist: str,
        album: str = "",
        duration: float = 0.0,
    ) -> Optional[dict]:
        """从 LRCLIB 搜索歌词。

        策略：
        1. 先尝试精确查询（track_name + artist_name + duration）
        2. 如果失败，尝试搜索并取最佳匹配
        """
        # ── 方式 1：精确查询 ─────────────────────────────
        params = {
            "track_name": title,
            "artist_name": artist,
        }
        if album:
            params["album_name"] = album
        if duration > 0:
            params["duration"] = int(duration)

        try:
            url = f"{self.BASE_URL}/get?{urlencode(params)}"
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return self._parse_response(data)
        except requests.RequestException:
            pass

        # ── 方式 2：搜索 + 最佳匹配 ───────────────────────
        try:
            search_params = {
                "track_name": title,
                "artist_name": artist,
            }
            url = f"{self.BASE_URL}/search?{urlencode(search_params)}"
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                results = resp.json()
                if isinstance(results, list) and results:
                    # 如果有 duration，尝试精确匹配
                    if duration > 0:
                        best = self._best_match(results, duration)
                        if best:
                            return self._parse_response(best)
                    # 取第一个结果
                    return self._parse_response(results[0])
        except requests.RequestException:
            pass

        # ── 方式 3：仅用关键词搜索 ────────────────────────
        try:
            query = f"{title} {artist}"
            url = f"{self.BASE_URL}/search?q={requests.utils.quote(query)}"
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                results = resp.json()
                if isinstance(results, list) and results:
                    best = self._best_match(results, duration) if duration > 0 else results[0]
                    return self._parse_response(best or results[0])
        except requests.RequestException:
            pass

        return None

    def _parse_response(self, data: dict) -> Optional[dict]:
        """解析 LRCLIB 响应为统一格式。"""
        if not data:
            return None

        plain = data.get("plainLyrics") or ""
        synced = data.get("syncedLyrics") or ""

        if not plain and not synced:
            return None

        return {
            "source": f"lrclib (id={data.get('id', '?')})",
            "plain_text": plain,
            "synced_text": synced if synced else None,
            "language": "original",
        }

    def _best_match(self, results: list[dict], target_duration: float) -> Optional[dict]:
        """从搜索结果中找到时长最匹配的。"""
        best = None
        best_diff = float("inf")

        for item in results:
            item_duration = item.get("duration", 0) or 0
            if item_duration > 0:
                diff = abs(item_duration - target_duration)
                if diff < best_diff:
                    best_diff = diff
                    best = item

        return best
