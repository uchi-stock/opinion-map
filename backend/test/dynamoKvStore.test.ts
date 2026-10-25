import { DeleteCommand, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { describe, expect, it } from "vitest";
import { DynamoKvStore, GSI1_NAME } from "../src/repositories/dynamoKvStore.js";

function stub(handler: (command: any) => unknown = () => ({})) {
  const sent: any[] = [];
  const client = {
    send: async (command: any) => {
      sent.push(command);
      return handler(command);
    },
  } as any;
  return { store: new DynamoKvStore(client, "T"), sent };
}

const failure = (name: string, extra: object = {}) => Object.assign(new Error(name), { name, ...extra });

describe("DynamoKvStore", () => {
  it("get は強い整合性で読む", async () => {
    const { store, sent } = stub(() => ({ Item: { pk: "a", data: 1 } }));
    expect(await store.get("a")).toEqual({ pk: "a", data: 1 });
    expect(sent[0]).toBeInstanceOf(GetCommand);
    expect(sent[0].input).toEqual({ TableName: "T", Key: { pk: "a" }, ConsistentRead: true });
  });

  it("put の条件は、予約語 ttl を別名にする", async () => {
    const { store, sent } = stub();
    await store.put({ pk: "a", data: 1 });
    await store.put({ pk: "b", data: 1 }, { type: "notExists" });
    await store.put({ pk: "c", data: 1 }, { type: "notExistsOrExpired", now: 100 });
    expect(sent[0]).toBeInstanceOf(PutCommand);
    expect(sent[0].input.ConditionExpression).toBeUndefined();
    expect(sent[1].input.ConditionExpression).toBe("attribute_not_exists(pk)");
    expect(sent[2].input).toMatchObject({
      ConditionExpression: "attribute_not_exists(pk) OR #ttl < :now",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: { ":now": 100 },
    });
  });

  it("transactWrite は条件を付け、条件の失敗だけを conflict にする", async () => {
    const ok = stub();
    expect(
      await ok.store.transactWrite([
        { type: "put", item: { pk: "m", data: 1 }, condition: { type: "notExists" } },
        { type: "delete", pk: "l", ifDataEquals: { field: "runId", value: "r1" } },
      ]),
    ).toBe("ok");
    expect(ok.sent[0]).toBeInstanceOf(TransactWriteCommand);
    expect(ok.sent[0].input.TransactItems[0].Put.ConditionExpression).toBe("attribute_not_exists(pk)");
    expect(ok.sent[0].input.TransactItems[1].Delete).toMatchObject({
      Key: { pk: "l" },
      ConditionExpression: "#data.#field = :value",
      ExpressionAttributeNames: { "#data": "data", "#field": "runId" },
      ExpressionAttributeValues: { ":value": "r1" },
    });

    const conflict = stub(() => {
      throw failure("TransactionCanceledException", { CancellationReasons: [{ Code: "ConditionalCheckFailed" }, { Code: "None" }] });
    });
    expect(await conflict.store.transactWrite([{ type: "put", item: { pk: "m", data: 1 } }])).toBe("conflict");
  });

  it("別のトランザクションとの衝突や、その他のエラーは、conflict にせず投げる", async () => {
    const clash = stub(() => {
      throw failure("TransactionCanceledException", { CancellationReasons: [{ Code: "TransactionConflict" }] });
    });
    await expect(clash.store.transactWrite([{ type: "put", item: { pk: "m", data: 1 } }])).rejects.toThrow();
    const other = stub(() => {
      throw failure("ProvisionedThroughputExceededException");
    });
    await expect(other.store.transactWrite([{ type: "put", item: { pk: "m", data: 1 } }])).rejects.toThrow();
  });

  it("一覧は GSI1 を引き、続きがあれば最後まで読む", async () => {
    let page = 0;
    const { store, sent } = stub(() =>
      page++ === 0
        ? { Items: [{ pk: "a", data: 1 }], LastEvaluatedKey: { pk: "a" } }
        : { Items: [{ pk: "b", data: 2 }] },
    );
    const items = await store.queryByGsi1("G", { fromSk: "2026" });
    expect(items.map((i) => i.pk)).toEqual(["a", "b"]);
    expect(sent[0]).toBeInstanceOf(QueryCommand);
    expect(sent[0].input).toMatchObject({
      IndexName: GSI1_NAME,
      KeyConditionExpression: "gsi1pk = :p AND gsi1sk >= :s",
      ExpressionAttributeValues: { ":p": "G", ":s": "2026" },
    });
    expect(sent[1].input.ExclusiveStartKey).toEqual({ pk: "a" });
  });

  it("件数は、本体を読まずに数える", async () => {
    const { store, sent } = stub(() => ({ Count: 3 }));
    expect(await store.countByGsi1("G")).toBe(3);
    expect(sent[0].input.Select).toBe("COUNT");
    expect(sent[0].input.KeyConditionExpression).toBe("gsi1pk = :p");
  });

  it("条件付きの削除は、条件の失敗なら false を返し、他のエラーは投げる", async () => {
    const failed = stub(() => {
      throw failure("ConditionalCheckFailedException");
    });
    expect(await failed.store.delete("l", { field: "runId", value: "x" })).toBe(false);
    expect(failed.sent[0]).toBeInstanceOf(DeleteCommand);
    const broken = stub(() => {
      throw failure("InternalServerError");
    });
    await expect(broken.store.delete("l")).rejects.toThrow();
    expect(await stub().store.delete("l")).toBe(true);
  });
});
