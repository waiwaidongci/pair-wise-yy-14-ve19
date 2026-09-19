// 单例存储：模块级当前状态 + 同步提交。
// 所有变更经由 runOp 原子完成 —— 重复点击、并发提交读到的一定是首次提交后的状态，
// 因此天然“沿用首次结果”；提交成功才写 localStorage，刷新后状态一致。

import { Db } from "./domain";
import { OpOutcome, OpResult } from "./ops";
import { seedDb } from "./seed";

const STORAGE_KEY = "hxyfront-62013.handover.v1";

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (
        parsed &&
        Array.isArray(parsed.components) &&
        Array.isArray(parsed.handovers) &&
        typeof parsed.seq === "number"
      ) {
        return parsed;
      }
    }
  } catch {
    // 存储不可用或数据损坏时回退到种子数据
  }
  return seedDb();
}

let db: Db = load();
const listeners = new Set<() => void>();

export function getDb(): Db {
  return db;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function persist(next: Db): void {
  db = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 存储不可用时仍保持内存态一致
  }
  listeners.forEach((fn) => fn());
}

/** 执行原子操作：操作返回新状态才提交并落库，拒绝则原样保留 */
export function runOp(op: (db: Db) => OpOutcome): OpResult {
  const outcome = op(db);
  if (outcome.next && outcome.next !== db) {
    persist(outcome.next);
  }
  return outcome.result;
}

export function resetAll(): OpResult {
  persist(seedDb());
  return { ok: true, tone: "info", message: "已重置为演示数据。" };
}
