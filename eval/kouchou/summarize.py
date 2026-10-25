"""hierarchical_result.jsonをJob Summary向けのMarkdownに要約する。"""
import json
import sys
from collections import defaultdict

path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)

clusters = data.get("clusters", [])
args = data.get("arguments", [])
by_cluster = defaultdict(list)
for a in args:
    for cid in a.get("cluster_ids", []):
        by_cluster[cid].append(a)

print("## 広聴AI分析結果")
print()
print(f"- 意見（argument）数: {len(args)}")
print(f"- クラスタ数: {len(clusters)}")
print()
for level in sorted({c.get("level") for c in clusters}):
    print(f"### 階層{level}")
    print()
    for c in [c for c in clusters if c.get("level") == level]:
        print(f"#### {c.get('label')}（{c.get('value')}件）")
        print()
        print(c.get("takeaway", ""))
        print()
        if level == max(c2.get("level") for c2 in clusters):
            for a in by_cluster.get(c.get("id"), [])[:20]:
                print(f"- {a.get('argument')}（元: {a.get('comment_id')}）")
            print()
