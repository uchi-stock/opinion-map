// reusable-cd.ymlのreleaseジョブがenable_shared_release_config: trueの場合、
// dev-standards/release-config.cjsをこのリポジトリのルートへコピーするため、相対パスでrequireする。
const { buildReleaseConfig } = require("./release-config.cjs");

module.exports = buildReleaseConfig({
  repositoryUrl: "https://github.com/uchi-stock/opinion-map.git",
  gitAssets: ["CHANGELOG.md", "package.json", "package-lock.json"],
  // CHANGELOG.mdのJSON変換(enable_changelog_json)は使わないので、何もしない
  changelogPrepareCmd: "true",
});
