// symlink(dev-standards の共有ヘルパー)の型。実装は JavaScript のため、ここで宣言する
export default function getAppVersionDefine(packageJsonPath: URL | string, now?: Date): Record<string, string>;
