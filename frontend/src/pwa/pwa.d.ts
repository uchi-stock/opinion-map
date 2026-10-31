// dev-standards の共有コンポーネント(.jsx)の型。JS のため、型を、ここで宣言する
declare module "*/ServiceWorkerRegistration.jsx" {
  export default function ServiceWorkerRegistration(props?: { swUrl?: string }): null;
}
declare module "*/UpdateNotifier.jsx" {
  export default function UpdateNotifier(): import("react").ReactElement | null;
}
