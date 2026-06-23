"""LRC 解析器单元测试。"""

import unittest
from src.lyrics.lrc_parser import LRCParser


class TestLRCParser(unittest.TestCase):
    """测试 LRC 歌词解析器。"""

    def setUp(self):
        self.parser = LRCParser()

    def test_parse_synced_lyrics(self):
        """测试解析带时间戳的同步歌词。"""
        lrc = """[ti:Test Song]
[ar:Test Artist]
[00:10.00]First line
[00:20.50]Second line
[00:30.00]Third line"""

        result = self.parser.parse(lrc)

        self.assertEqual(len(result), 3)
        self.assertEqual(result[0], (10.0, "First line"))
        self.assertEqual(result[1], (20.5, "Second line"))
        self.assertEqual(result[2], (30.0, "Third line"))

    def test_parse_simple_timestamp(self):
        """测试解析简化格式时间戳 [mm:ss]。"""
        lrc = """[00:05]Line one
[00:15]Line two"""

        result = self.parser.parse(lrc)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0], (5.0, "Line one"))
        self.assertEqual(result[1], (15.0, "Line two"))

    def test_parse_plain_text(self):
        """测试解析无时间戳纯文本。"""
        text = """Line one
Line two
Line three"""

        result = self.parser.parse(text)
        self.assertEqual(len(result), 3)
        # 纯文本每行时间为 0
        for time_sec, _ in result:
            self.assertEqual(time_sec, 0.0)

    def test_is_synced(self):
        """测试同步检测。"""
        self.assertTrue(self.parser.is_synced("[00:10.00]Hello"))
        self.assertFalse(self.parser.is_synced("Plain text line"))

    def test_metadata_extraction(self):
        """测试元数据提取。"""
        lrc = """[ti:My Song]
[ar:My Artist]
[al:My Album]
[00:10.00]Lyrics"""

        self.parser.parse(lrc)
        meta = self.parser.metadata
        self.assertEqual(meta.get("ti"), "My Song")
        self.assertEqual(meta.get("ar"), "My Artist")
        self.assertEqual(meta.get("al"), "My Album")

    def test_parse_to_plain(self):
        """测试转换为纯文本。"""
        lrc = """[ti:Title]
[00:05.00]First
[00:10.00]Second"""

        plain = self.parser.parse_to_plain(lrc)
        self.assertNotIn("[00:05.00]", plain)
        self.assertNotIn("[ti:Title]", plain)
        self.assertIn("First", plain)
        self.assertIn("Second", plain)

    def test_generate_lrc(self):
        """测试生成 LRC 格式。"""
        lyrics = [
            (5.0, "Line one"),
            (10.5, "Line two"),
        ]
        metadata = {"ti": "Title", "ar": "Artist"}

        lrc = self.parser.generate_lrc(lyrics, metadata)

        self.assertIn("[ti:Title]", lrc)
        self.assertIn("[ar:Artist]", lrc)
        self.assertIn("[00:05.00]Line one", lrc)
        self.assertIn("[00:10.50]Line two", lrc)

    def test_empty_input(self):
        """测试空输入。"""
        result = self.parser.parse("")
        self.assertEqual(len(result), 0)

    def test_multiple_timestamps_same_line(self):
        """测试同一行多个时间戳。"""
        lrc = """[00:10.00][00:20.00]Repeated line"""

        result = self.parser.parse(lrc)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0], (10.0, "Repeated line"))
        self.assertEqual(result[1], (20.0, "Repeated line"))


if __name__ == "__main__":
    unittest.main()
