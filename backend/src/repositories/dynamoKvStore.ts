import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { KvItem, KvStore, PutCondition, WriteOp } from "./kvStore.js";

/** 使う操作だけに絞る。テストでは send を差し替える */
export type DocClient = Pick<DynamoDBDocumentClient, "send">;

export const GSI1_NAME = "gsi1";

const hasName = (error: unknown, name: string) => typeof error === "object" && error !== null && (error as { name?: string }).name === name;

/** 条件付きの書き込みが、条件を満たさずに失敗したか */
function isConditionFailure(error: unknown): boolean {
  return hasName(error, "ConditionalCheckFailedException");
}

/**
 * トランザクションが、条件を満たさずに取り消されたか。
 * 別のトランザクションとの衝突（TransactionConflict）などは含めない。
 * それらは、条件の失敗とは別に、そのまま失敗させ、呼び出し側の再送に任せる。
 */
function isConditionCancellation(error: unknown): boolean {
  if (!hasName(error, "TransactionCanceledException")) return false;
  const reasons = (error as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons ?? [];
  const codes = reasons.map((r) => r.Code ?? "None");
  return codes.includes("ConditionalCheckFailed") && codes.every((c) => c === "None" || c === "ConditionalCheckFailed");
}

function conditionParts(condition: PutCondition | undefined) {
  if (!condition) return {};
  if (condition.type === "notExists") return { ConditionExpression: "attribute_not_exists(pk)" };
  // ttl は DynamoDB の予約語なので、別名を使う
  return {
    ConditionExpression: "attribute_not_exists(pk) OR #ttl < :now",
    ExpressionAttributeNames: { "#ttl": "ttl" },
    ExpressionAttributeValues: { ":now": condition.now },
  };
}

function deleteConditionParts(ifDataEquals: { field: string; value: unknown } | undefined) {
  if (!ifDataEquals) return {};
  return {
    ConditionExpression: "#data.#field = :value",
    ExpressionAttributeNames: { "#data": "data", "#field": ifDataEquals.field },
    ExpressionAttributeValues: { ":value": ifDataEquals.value },
  };
}

/**
 * DynamoDB の保存先。テーブルは、主キー pk（文字列）と、GSI1（gsi1pk と gsi1sk）を持つ。
 * GSI は結果整合である。一覧は、書いた直後には、反映が遅れることがある。
 */
export class DynamoKvStore implements KvStore {
  private readonly client: DocClient;
  private readonly table: string;

  constructor(client: DocClient, tableName: string) {
    this.client = client;
    this.table = tableName;
  }

  async get(pk: string): Promise<KvItem | undefined> {
    const result = await this.client.send(new GetCommand({ TableName: this.table, Key: { pk }, ConsistentRead: true }));
    return result.Item as KvItem | undefined;
  }

  async put(item: KvItem, condition?: PutCondition): Promise<void> {
    await this.client.send(new PutCommand({ TableName: this.table, Item: item, ...conditionParts(condition) }));
  }

  async transactWrite(ops: WriteOp[]): Promise<"ok" | "conflict"> {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: ops.map((op) =>
            op.type === "put"
              ? { Put: { TableName: this.table, Item: op.item, ...conditionParts(op.condition) } }
              : { Delete: { TableName: this.table, Key: { pk: op.pk }, ...deleteConditionParts(op.ifDataEquals) } },
          ),
        }),
      );
      return "ok";
    } catch (error) {
      if (isConditionCancellation(error)) return "conflict";
      throw error;
    }
  }

  private async *pages(gsi1pk: string, fromSk: string | undefined, count: boolean) {
    let startKey: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.table,
          IndexName: GSI1_NAME,
          KeyConditionExpression: fromSk === undefined ? "gsi1pk = :p" : "gsi1pk = :p AND gsi1sk >= :s",
          ExpressionAttributeValues: fromSk === undefined ? { ":p": gsi1pk } : { ":p": gsi1pk, ":s": fromSk },
          ...(count ? { Select: "COUNT" as const } : {}),
          ...(startKey ? { ExclusiveStartKey: startKey } : {}),
        }),
      );
      yield result;
      startKey = result.LastEvaluatedKey;
    } while (startKey);
  }

  async queryByGsi1(gsi1pk: string, options: { fromSk?: string } = {}): Promise<KvItem[]> {
    const items: KvItem[] = [];
    for await (const page of this.pages(gsi1pk, options.fromSk, false)) items.push(...((page.Items ?? []) as KvItem[]));
    return items;
  }

  async countByGsi1(gsi1pk: string, options: { fromSk?: string } = {}): Promise<number> {
    let total = 0;
    for await (const page of this.pages(gsi1pk, options.fromSk, true)) total += page.Count ?? 0;
    return total;
  }

  async delete(pk: string, ifDataEquals?: { field: string; value: unknown }): Promise<boolean> {
    try {
      await this.client.send(new DeleteCommand({ TableName: this.table, Key: { pk }, ...deleteConditionParts(ifDataEquals) }));
      return true;
    } catch (error) {
      if (isConditionFailure(error)) return false;
      throw error;
    }
  }
}
