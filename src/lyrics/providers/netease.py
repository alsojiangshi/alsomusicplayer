"""网易云音乐歌词提供者。

通过网易云音乐 API 搜索和获取歌词。
"""

import json
from typing import Optional

import requests

from .base import LyricsProvider


class NeteaseProvider(LyricsProvider):
    """网易云音乐歌词提供者。"""

    SEARCH_URL = "https://music.163.com/api/search/get"
    LYRIC_URL = "https://music.163.com/api/song/lyric"

    @property
    def name(self) -> str:
        return "netease"

    def search(
        self,
        title: str,
        artist: str,
        album: str = "",
        duration: float = 0.0,
    ) -> Optional[dict]:
        """从网易云音乐搜索歌词。

        流程：
        1. 搜索歌曲获取 song_id
        2. 使用 song_id 获取歌词
        """
        song_id = self._search_song(title, artist)
        if song_id is None:
            return None

        return self._get_lyrics(song_id)

    def _search_song(self, title: str, artist: str) -> Optional[int]:
        """搜索歌曲获取 ID。"""
        try:
            params = {
                "s": f"{title} {artist}",
                "type": 1,
                "limit": 10,
                "offset": 0,
            }

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://music.163.com/",
                "Content-Type": "application/x-www-form-urlencoded",
            }

            resp = requests.post(
                self.SEARCH_URL,
                data=params,
                headers=headers,
                timeout=10,
            )

            if resp.status_code == 200:
                data = resp.json()
                songs = data.get("result", {}).get("songs", [])
                if songs:
                    # 优先匹配标题和艺术家
                    best = self._best_match(songs, title, artist)
                    return best.get("id") if best else songs[0].get("id")

        except requests.RequestException:
            pass

        return None

    def _get_lyrics(self, song_id: int) -> Optional[dict]:
        """获取指定歌曲的歌词。"""
        try:
            params = {"id": song_id, "lv": 1, "kv": 1, "tv": 1}

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://music.163.com/",
            }

            resp = requests.get(
                self.LYRIC_URL,
                params=params,
                headers=headers,
                timeout=10,
            )

            if resp.status_code == 200:
                data = resp.json()
                lrc = data.get("lrc", {}).get("lyric", "")
                tlyric = data.get("tlyric", {}).get("lyric", "")

                if not lrc:
                    return None

                return {
                    "source": f"netease (id={song_id})",
                    "plain_text": self._lrc_to_plain(lrc),
                    "synced_text": lrc if lrc else None,
                    "language": "original",
                }

        except requests.RequestException:
            pass

        return None

    def _best_match(self, songs: list[dict], title: str, artist: str) -> Optional[dict]:
        """从搜索结果中找到最佳匹配。"""
        title_lower = title.lower()
        artist_lower = artist.lower()

        for song in songs:
            song_name = song.get("name", "").lower()
            song_artists = [a.get("name", "").lower() for a in song.get("artists", [])]

            if title_lower in song_name or song_name in title_lower:
                if any(artist_lower in sa or sa in artist_lower for sa in song_artists):
                    return song

        return None

    def _lrc_to_plain(self, lrc_text: str) -> str:
        """简单的 LRC 到纯文本转换。"""
        import re
        return re.sub(r"\[.*?\]", "", lrc_text).strip()
