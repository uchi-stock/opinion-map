# 広聴AIの分析を1回だけ実行するコンテナ。Fargate のタスクとして、分析1回ごとに起動する。
# 広聴AIは改造せず、固定したコミットのパッケージをそのまま入れる。
# torch(sentence-transformers)は、ローカルで埋め込みを作るときだけ必要。
# API で埋め込む設定(is_embedded_at_local: false)では要らないので、入れない。
FROM python:3.12-slim

ENV PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1

# git は、固定したコミットからインストールするときだけ使う。入れたあとに消す
RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && pip install \
        'kouchou-ai-analysis-core[gemini,clustering] @ git+https://github.com/digitaldemocracy2030/kouchou-ai.git@7fff37a486bbc9e6f7b8c646e58b1aea5a99b95b#subdirectory=packages/analysis-core' \
        'polars<2' \
        boto3 \
    && apt-get purge -y --auto-remove git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY entrypoint.py /app/entrypoint.py

RUN useradd --create-home runner
USER runner

CMD ["python", "/app/entrypoint.py"]
