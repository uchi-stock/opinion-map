import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const publicFile = (name: string) => resolve(root, "public", name);

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}

const manifest = JSON.parse(readFileSync(publicFile("manifest.json"), "utf8")) as Manifest;

/** PNG の幅と高さ(IHDR) */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("manifest.json", () => {
  it("ホーム画面に追加できる構成になっている", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).not.toBe("");
    // 配信のパス(base)が変わっても動くよう、相対にしている
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
  });

  it("宣言したアイコンが、実在し、宣言どおりの大きさである", () => {
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === "any" && i.sizes === "192x192")).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === "any" && i.sizes === "512x512")).toBe(true);
    for (const icon of manifest.icons) {
      const path = publicFile(icon.src);
      expect(existsSync(path), icon.src).toBe(true);
      const [w, h] = icon.sizes.split("x").map(Number);
      expect(pngSize(path)).toEqual({ width: w, height: h });
    }
  });

  it("iOS 用のアイコンと favicon がある", () => {
    expect(pngSize(publicFile("apple-touch-icon.png"))).toEqual({ width: 180, height: 180 });
    expect(statSync(publicFile("favicon.png")).size).toBeGreaterThan(0);
  });
});

describe("index.html", () => {
  const html = readFileSync(resolve(root, "index.html"), "utf8");

  it("アイコンと manifest を読み込む。iOS 用のアイコンも別に指定する", () => {
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('rel="icon"');
    expect(html).toContain('name="theme-color"');
  });
});

describe("Service Worker の設定", () => {
  const sandbox: { self: { SW_CONFIG?: Record<string, unknown> } } = { self: {} };
  vm.runInNewContext(readFileSync(publicFile("sw-config.js"), "utf8"), sandbox);
  const config = sandbox.self.SW_CONFIG as {
    cacheVersion: string;
    precacheUrls: string[];
    apiHostnames: string[];
    noCacheSameOriginPrefixes: string[];
  };

  it("API は、キャッシュしない(意見の一覧や人数が、古いまま返らないように)", () => {
    expect(config.noCacheSameOriginPrefixes).toContain("/api");
    expect(config.apiHostnames).toEqual([]);
  });

  it("キャッシュの版と、先読みするページを持つ", () => {
    expect(config.cacheVersion).not.toBe("");
    expect(config.precacheUrls).toEqual(["./"]);
  });

  it("共通の sw.js が、設定を読み込む前提で、symlink されている", () => {
    expect(readFileSync(publicFile("sw.js"), "utf8")).toContain('importScripts("./sw-config.js")');
  });
});
