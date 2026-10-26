"""広聴AIの分析を1回だけ実行する。

流れ:
1. S3 から、入力(input.csv)と設定(config.json)を取る
2. 広聴AIの CLI(kouchou-analyze)を実行する
3. 結果(hierarchical_result.json)を、S3 に result.json として置く
   失敗したときは、error.json を置く

error.json の理由には、投稿の本文を含めない。ログの生の文字列は、載せない。
"""
import glob
import json
import os
import re
import subprocess
import sys
import tempfile

# 標準エラーの内容から、原因を分類する。本文を含みうるので、生の文字列は理由に使わない
HINTS = [
    (r"429|RESOURCE_EXHAUSTED|rate.?limit|quota", "LLMの利用上限(レート制限・割当)に達した可能性があります"),
    (r"402|billing|insufficient", "LLMの課金・残高の問題の可能性があります"),
    (r"401|403|API key|PERMISSION_DENIED|UNAUTHENTICATED", "LLMのAPIキーが正しくない可能性があります"),
    (r"timed? ?out|Timeout", "LLMとの通信がタイムアウトした可能性があります"),
    (r"MemoryError|Killed|out of memory", "メモリが足りなかった可能性があります"),
]


def classify(stderr_text):
    for pattern, hint in HINTS:
        if re.search(pattern, stderr_text, re.IGNORECASE):
            return hint
    return None


def failure_summary(stage, code=None, stderr_text=""):
    parts = [f"広聴AIの分析が失敗しました({stage}"]
    if code is not None:
        parts.append(f"、終了コード {code}")
    summary = "".join(parts) + ")"
    hint = classify(stderr_text)
    return f"{summary}。{hint}" if hint else summary


def main(env=None, s3=None, run=subprocess.run, workdir=None):
    env = os.environ if env is None else env
    bucket = env["ANALYSIS_BUCKET"]
    prefix = env["ANALYSIS_PREFIX"].rstrip("/")
    timeout = int(env.get("ANALYSIS_TIMEOUT_SECONDS", "1500"))
    if s3 is None:
        import boto3

        s3 = boto3.client("s3")
    work = workdir or tempfile.mkdtemp(prefix="analysis-")
    inputs = os.path.join(work, "inputs")
    outputs = os.path.join(work, "outputs")
    os.makedirs(inputs, exist_ok=True)
    os.makedirs(outputs, exist_ok=True)

    def fail(stage, code=None, stderr_text=""):
        body = json.dumps({"summary": failure_summary(stage, code, stderr_text)}, ensure_ascii=False)
        s3.put_object(Bucket=bucket, Key=f"{prefix}/error.json", Body=body.encode("utf-8"))
        return 1

    try:
        s3.download_file(bucket, f"{prefix}/input.csv", os.path.join(inputs, "input.csv"))
        s3.download_file(bucket, f"{prefix}/config.json", os.path.join(work, "config.json"))
    except Exception:
        return fail("入力の取得")

    try:
        done = run(
            ["kouchou-analyze", "--config", os.path.join(work, "config.json"), "--input-dir", inputs, "--output-dir", outputs],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return fail("時間切れ")
    # 標準出力・標準エラーは、投稿の本文を含みうる。CloudWatch には残さない(分類にだけ使う)
    if done.returncode != 0:
        return fail("分析の実行", done.returncode, (done.stderr or "") + (done.stdout or ""))

    results = glob.glob(os.path.join(outputs, "**", "hierarchical_result.json"), recursive=True)
    if not results:
        return fail("結果の確認")
    try:
        s3.upload_file(results[0], bucket, f"{prefix}/result.json")
    except Exception:
        return fail("結果の保存")
    print("分析が完了しました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
