import importlib.util
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

spec = importlib.util.spec_from_file_location('backup', 'tools/economy-backup.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
scratch = Path('private-economy')
scratch.mkdir(exist_ok=True)


class BackupTests(unittest.TestCase):
    def test_restore_and_no_overwrite(self):
        with tempfile.TemporaryDirectory(dir=scratch) as directory:
            source, target = Path(directory)/'export.sql', Path(directory)/'restored.sqlite'
            source.write_text("CREATE TABLE saves(id INTEGER PRIMARY KEY,data TEXT); INSERT INTO saves VALUES(42,'{\"coins\":500}'); CREATE TABLE purchases(id INTEGER,item TEXT); INSERT INTO purchases VALUES(42,'legend');", encoding='utf8')
            report = module.restore(source, target)
            self.assertTrue(report['restored'])
            self.assertEqual(report['tables']['saves']['rows'], 1)
            self.assertNotIn('coins', str(report))
            with self.assertRaises(FileExistsError):
                module.restore(source, target)
            with closing(sqlite3.connect(target)) as db:
                self.assertEqual(db.execute('SELECT data FROM saves').fetchone()[0], '{"coins":500}')

    def test_reject_broken_and_external_writes(self):
        for sql in ['nonsense', "ATTACH DATABASE 'other.sqlite' AS other;", "PRAGMA temp_store_directory='/tmp';", "SELECT load_extension('x');", '']:
            with self.subTest(sql=sql), tempfile.TemporaryDirectory(dir=scratch) as directory:
                source, target = Path(directory)/'export.sql', Path(directory)/'restored.sqlite'
                source.write_text(sql, encoding='utf8')
                with self.assertRaises((sqlite3.Error, ValueError)):
                    module.restore(source, target)
                self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
