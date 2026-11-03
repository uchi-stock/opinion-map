// symlink(dev-standards の共有フック)の型。実装は JavaScript のため、ここで宣言する
export function useSpeechRecognition(options?: {
  lang?: string;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  onNoResult?: () => void;
}): { isSupported: boolean; start: () => void };
