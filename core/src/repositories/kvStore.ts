/**
 * DynamoDB に依存しない、最小の保存先。リポジトリの実装は、この型だけに依存する。
 * 本番は DynamoDB（dynamoKvStore.ts）、テストはメモリ（MemoryKvStore）に差し替える。
 *
 * 項目は、主キー pk と、データ data を持つ。
 * 一覧用に、gsi1pk と gsi1sk の組（GSI1）で、並べて取り出せる。
 */
export interface KvItem {
  pk: string;
  gsi1pk?: string;
  /** 一覧の並び順。文字列の昇順 */
  gsi1sk?: string;
  /** 項目の期限（エポック秒）。DynamoDB の TTL で消える。ロックの失効にも使う */
  ttl?: number;
  data: unknown;
}

/** 書き込みの条件 */
export type PutCondition =
  /** 同じキーの項目がなければ */
  | { type: "notExists" }
  /** 同じキーの項目がないか、期限（ttl）が now を過ぎていれば */
  | { type: "notExistsOrExpired"; now: number };

export type WriteOp =
  | { type: "put"; item: KvItem; condition?: PutCondition }
  /** data の指定の項目が、期待の値のときだけ消す。違えば、何もしない */
  | { type: "delete"; pk: string; ifDataEquals?: { field: string; value: unknown } };

export interface KvStore {
  get(pk: string): Promise<KvItem | undefined>;
  put(item: KvItem, condition?: PutCondition): Promise<void>;
  /**
   * 複数の書き込みを、すべて成功するか、すべて失敗するかで行う。
   * 条件を満たさない書き込みがあれば、何も書かず、"conflict" を返す。
   */
  transactWrite(ops: WriteOp[]): Promise<"ok" | "conflict">;
  /** gsi1pk が一致する項目を、gsi1sk の昇順で返す。fromSk 以上に絞れる */
  queryByGsi1(gsi1pk: string, options?: { fromSk?: string }): Promise<KvItem[]>;
  /** queryByGsi1 の件数だけ */
  countByGsi1(gsi1pk: string, options?: { fromSk?: string }): Promise<number>;
  /** 条件付きの削除。条件を満たさなければ、何もせず false を返す */
  delete(pk: string, ifDataEquals?: { field: string; value: unknown }): Promise<boolean>;
}

/** 条件の判定。メモリ実装と、テストで共有する */
function conditionHolds(existing: KvItem | undefined, condition: PutCondition | undefined): boolean {
  if (!condition) return true;
  if (condition.type === "notExists") return existing === undefined;
  return existing === undefined || (existing.ttl !== undefined && existing.ttl < condition.now);
}

const dataField = (item: KvItem, field: string): unknown => (item.data as Record<string, unknown> | null)?.[field];

/** テストとローカル開発用。プロセスが終わると消える。transactWrite は途中で中断せず、不可分に行う */
export class MemoryKvStore implements KvStore {
  private readonly items = new Map<string, KvItem>();

  async get(pk: string): Promise<KvItem | undefined> {
    const item = this.items.get(pk);
    return item ? structuredClone(item) : undefined;
  }

  async put(item: KvItem, condition?: PutCondition): Promise<void> {
    if (!conditionHolds(this.items.get(item.pk), condition)) throw new Error("ConditionalCheckFailed");
    this.items.set(item.pk, structuredClone(item));
  }

  async transactWrite(ops: WriteOp[]): Promise<"ok" | "conflict"> {
    for (const op of ops) {
      const existing = this.items.get(op.type === "put" ? op.item.pk : op.pk);
      if (op.type === "put" && !conditionHolds(existing, op.condition)) return "conflict";
      if (op.type === "delete" && op.ifDataEquals) {
        if (!existing || dataField(existing, op.ifDataEquals.field) !== op.ifDataEquals.value) return "conflict";
      }
    }
    for (const op of ops) {
      if (op.type === "put") this.items.set(op.item.pk, structuredClone(op.item));
      else this.items.delete(op.pk);
    }
    return "ok";
  }

  private query(gsi1pk: string, fromSk: string | undefined): KvItem[] {
    return [...this.items.values()]
      .filter((i) => i.gsi1pk === gsi1pk && i.gsi1sk !== undefined && (fromSk === undefined || i.gsi1sk >= fromSk))
      .sort((a, b) => (a.gsi1sk! < b.gsi1sk! ? -1 : a.gsi1sk! > b.gsi1sk! ? 1 : 0));
  }

  async queryByGsi1(gsi1pk: string, options: { fromSk?: string } = {}): Promise<KvItem[]> {
    return this.query(gsi1pk, options.fromSk).map((i) => structuredClone(i));
  }

  async countByGsi1(gsi1pk: string, options: { fromSk?: string } = {}): Promise<number> {
    return this.query(gsi1pk, options.fromSk).length;
  }

  async delete(pk: string, ifDataEquals?: { field: string; value: unknown }): Promise<boolean> {
    const existing = this.items.get(pk);
    if (ifDataEquals && (!existing || dataField(existing, ifDataEquals.field) !== ifDataEquals.value)) return false;
    return this.items.delete(pk);
  }
}
