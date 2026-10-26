import json
import os
import subprocess
import tempfile
import unittest
from types import SimpleNamespace

import entrypoint


class FakeS3:
    def __init__(self, objects):
        self.objects = dict(objects)
        self.fail_download = False

    def download_file(self, bucket, key, path):
        if self.fail_download:
            raise RuntimeError("denied")
        with open(path, "wb") as f:
            f.write(self.objects[(bucket, key)])

    def upload_file(self, path, bucket, key):
        with open(path, "rb") as f:
            self.objects[(bucket, key)] = f.read()

    def put_object(self, Bucket, Key, Body):
        self.objects[(Bucket, Key)] = Body


ENV = {"ANALYSIS_BUCKET": "b", "ANALYSIS_PREFIX": "analysis/r1/"}
INPUTS = {("b", "analysis/r1/input.csv"): "comment-id,comment-body\n1,本文\n".encode(), ("b", "analysis/r1/config.json"): b"{}"}


def fake_run(returncode=0, stderr="", write_result=True):
    def run(cmd, capture_output, text, timeout):
        outdir = cmd[cmd.index("--output-dir") + 1]
        if write_result:
            os.makedirs(os.path.join(outdir, "x", "y"), exist_ok=True)
            with open(os.path.join(outdir, "x", "y", "hierarchical_result.json"), "w") as f:
                f.write('{"clusters": []}')
        return SimpleNamespace(returncode=returncode, stderr=stderr, stdout="")

    return run


class EntrypointTest(unittest.TestCase):
    def run_main(self, s3, run):
        with tempfile.TemporaryDirectory() as d:
            return entrypoint.main(env=ENV, s3=s3, run=run, workdir=d)

    def test_success_uploads_result(self):
        s3 = FakeS3(INPUTS)
        self.assertEqual(self.run_main(s3, fake_run()), 0)
        self.assertEqual(json.loads(s3.objects[("b", "analysis/r1/result.json")]), {"clusters": []})
        self.assertNotIn(("b", "analysis/r1/error.json"), s3.objects)

    def test_cli_failure_writes_error_with_hint_but_not_the_raw_text(self):
        s3 = FakeS3(INPUTS)
        secret = "投稿の本文が混ざった 429 RESOURCE_EXHAUSTED"
        self.assertEqual(self.run_main(s3, fake_run(returncode=2, stderr=secret, write_result=False)), 1)
        body = s3.objects[("b", "analysis/r1/error.json")].decode()
        summary = json.loads(body)["summary"]
        self.assertIn("終了コード 2", summary)
        self.assertIn("利用上限", summary)
        self.assertNotIn("投稿の本文", body)
        self.assertNotIn(("b", "analysis/r1/result.json"), s3.objects)

    def test_missing_result_file_is_failure(self):
        s3 = FakeS3(INPUTS)
        self.assertEqual(self.run_main(s3, fake_run(write_result=False)), 1)
        self.assertIn("結果の確認", s3.objects[("b", "analysis/r1/error.json")].decode())

    def test_download_failure(self):
        s3 = FakeS3(INPUTS)
        s3.fail_download = True
        self.assertEqual(self.run_main(s3, fake_run()), 1)
        self.assertIn("入力の取得", s3.objects[("b", "analysis/r1/error.json")].decode())

    def test_timeout(self):
        def run(*args, **kwargs):
            raise subprocess.TimeoutExpired(cmd="x", timeout=1)

        s3 = FakeS3(INPUTS)
        self.assertEqual(self.run_main(s3, run), 1)
        self.assertIn("時間切れ", s3.objects[("b", "analysis/r1/error.json")].decode())

    def test_classify(self):
        self.assertIn("APIキー", entrypoint.classify("403 PERMISSION_DENIED"))
        self.assertIn("メモリ", entrypoint.classify("Killed"))
        self.assertIsNone(entrypoint.classify("something unrelated"))


if __name__ == "__main__":
    unittest.main()
