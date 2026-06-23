"""文件工具函数单元测试。"""

import unittest
from src.utils.file_utils import format_duration, format_file_size, safe_filename


class TestFileUtils(unittest.TestCase):

    def test_format_duration(self):
        """测试时长格式化。"""
        self.assertEqual(format_duration(0), "00:00")
        self.assertEqual(format_duration(65), "01:05")
        self.assertEqual(format_duration(3661), "01:01:01")
        self.assertEqual(format_duration(30.5), "00:30")
        self.assertEqual(format_duration(-1), "00:00")

    def test_format_file_size(self):
        """测试文件大小格式化。"""
        self.assertEqual(format_file_size(0), "0.0 B")
        self.assertEqual(format_file_size(1024), "1.0 KB")
        self.assertIn("MB", format_file_size(1024 * 1024))
        self.assertIn("GB", format_file_size(1024 * 1024 * 1024))

    def test_safe_filename(self):
        """测试安全文件名转换。"""
        self.assertEqual(safe_filename("hello:world"), "hello_world")
        self.assertEqual(safe_filename('test<file>?'), "test_file__")


if __name__ == "__main__":
    unittest.main()
