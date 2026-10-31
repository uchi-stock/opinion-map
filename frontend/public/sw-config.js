// Service Worker(dev-standards の共通の sw.js)の、このプロダクト固有の設定。
// 方針: ページ本体はネットワーク優先、ハッシュ付きの画面のファイルは、キャッシュを先に返しつつ裏で更新する。
self.SW_CONFIG = {
  // キャッシュの戦略や先読みの一覧を変えたら、必ず値を変える(古いキャッシュを捨てるため)
  cacheVersion: "v1",
  // インストール時に先読みするページ。配信のパス(base)の直下
  precacheUrls: ["./"],
  // 別のホストの API は使わない(画面と同じドメインの /api を使う)
  apiHostnames: [],
  // /api は、意見の一覧、いいね、人数など、常に最新が要る。キャッシュせず、常にネットワークへ流す
  noCacheSameOriginPrefixes: ["/api"],
};
