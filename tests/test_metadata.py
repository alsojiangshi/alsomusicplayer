"""元数据提取单元测试。"""

import unittest
from src.utils.metadata import (
    FORMAT_MAP,
    SUPPORTED_EXTENSIONS,
    is_supported_audio,
)


class TestMetadataUtils(unittest.TestCase):

    def test_supported_extensions(self):
        """测试支持的格式扩展名。"""
        self.assertIn(".mp3", SUPPORTED_EXTENSIONS)
        self.assertIn(".flac", SUPPORTED_EXTENSIONS)
        self.assertIn(".wav", SUPPORTED_EXTENSIONS)
        self.assertIn(".ogg", SUPPORTED_EXTENSIONS)
        self.assertIn(".m4a", SUPPORTED_EXTENSIONS)

    def test_is_supported_audio(self):
        """测试音频文件检测。"""
        self.assertTrue(is_supported_audio("song.mp3"))
        self.assertTrue(is_supported_audio("song.FLAC"))
        self.assertTrue(is_supported_audio("/path/to/song.ogg"))
        self.assertFalse(is_supported_audio("song.txt"))
        self.assertFalse(is_supported_audio("song.pdf"))
        self.assertFalse(is_supported_audio("noextension"))

    def test_format_map(self):
        """测试格式映射。"""
        self.assertEqual(FORMAT_MAP[".mp3"], "MP3")
        self.assertEqual(FORMAT_MAP[".flac"], "FLAC")
        self.assertEqual(FORMAT_MAP[".m4a"], "M4A")


if __name__ == "__main__":
    unittest.main()
