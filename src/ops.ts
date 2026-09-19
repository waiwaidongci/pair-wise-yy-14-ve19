// 原子操作：每个操作都是纯函数，校验全部通过才返回新状态；
// 拒绝时返回的 next 为 undefined，调用方不得写库 —— 保证“整次操作拒绝且不落库”。

import {
  ComponentItem,
  Db,
  Handover,
  HandoverMode,
  componentByKey,
  isOpen,
  liveDownstream,
  normalizeSection,
  normalizeWood,
  openHandoverOf,
  timestamp,
} from "./domain";

export type Tone = "success" | "error" | "info";

export interface OpResult {
  ok: boolean;
  tone: Tone;
  message: string;
}

export interface OpOutcome {
  next?: Db; // undefined = 拒绝，不落库
  result: OpResult;
}

const ok = (message: string, tone: Tone = "success"): OpResult => ({ ok: true, tone, message });
const fail = (message: string): OpResult => ({ ok: false, tone: "error", message });

function replaceHandover(db: Db, updated: Handover): Db {
  return {
    ...db,
    handovers: db.handovers.map((h) => (h.id === updated.id ? updated : h)),
  };
}

function pushLog(h: Handover, text: string): Handover {
  return { ...h, log: [...h.log, { at: timestamp(), text }] };
}

/** 发起交接：同一构件仅允许一笔未关闭交接；重复 / 并发提交沿用首次结果 */
export function createHandover(db: Db, componentKey: string, mode: HandoverMode): OpOutcome {
  const item = componentByKey(db, componentKey);
  if (!item) return { result: fail("构件不存在，无法发起交接。") };

  const existing = openHandoverOf(db, componentKey);
  if (existing) {
    return {
      result: ok(
        `${item.code} 已存在未关闭交接 ${existing.id}（${existing.status}），本次提交沿用首次结果，未重复开单。`,
        "info"
      ),
    };
  }

  if (item.critical && mode !== "原材更换") {
    return { result: fail(`发起被拒绝：${item.code} 为危急构件，只能按「原材更换」交接，不允许修缮归安。`) };
  }

  const id = `JJ-${String(db.seq).padStart(4, "0")}`;
  const now = timestamp();
  const handover: Handover = {
    id,
    componentKey,
    mode,
    status: "待拆卸",
    createdAt: now,
    log: [{ at: now, text: `发起交接（${mode}）` }],
  };
  return {
    next: { ...db, seq: db.seq + 1, handovers: [...db.handovers, handover] },
    result: ok(`交接单 ${id} 已建立：${item.building} · ${item.code}（${mode}），当前状态「待拆卸」。`),
  };
}

/** 登记临时支撑 */
export function registerSupport(db: Db, handoverId: string, note: string): OpOutcome {
  const h = db.handovers.find((x) => x.id === handoverId);
  if (!h || !isOpen(h)) return { result: fail("交接单不存在或已闭环。") };
  if (h.status !== "待拆卸") return { result: fail(`交接单当前为「${h.status}」，不可再登记临时支撑。`) };
  if (h.supportNote) {
    return { result: ok(`交接单 ${h.id} 已登记过临时支撑，沿用首次登记内容。`, "info") };
  }
  const text = note.trim();
  if (!text) return { result: fail("请填写临时支撑方案（构造、道数、顶托部位）。") };

  const updated = pushLog(
    { ...h, supportNote: text, supportAt: timestamp() },
    `登记临时支撑：${text}`
  );
  return {
    next: replaceHandover(db, updated),
    result: ok(`交接单 ${h.id} 临时支撑已登记，可执行拆卸。`),
  };
}

/** 执行拆卸：仍有在架下游引用且未登记临时支撑 → 整单拒绝，不落库 */
export function dismantle(db: Db, handoverId: string): OpOutcome {
  const h = db.handovers.find((x) => x.id === handoverId);
  if (!h || !isOpen(h)) return { result: fail("交接单不存在或已闭环。") };
  if (h.status !== "待拆卸") return { result: fail(`交接单当前为「${h.status}」，不可执行拆卸。`) };

  const item = componentByKey(db, h.componentKey);
  const refs = liveDownstream(db, h.componentKey);
  if (refs.length > 0 && !h.supportNote) {
    const names = refs.map((r) => `${r.building}·${r.code}`).join("、");
    return {
      result: fail(
        `拆卸被拒绝：${names} 仍在架引用 ${item?.code ?? h.componentKey}，须先登记临时支撑。本次操作已整体拒绝，未写入任何数据。`
      ),
    };
  }

  const updated = pushLog({ ...h, status: "已拆卸" }, "拆卸完成，构件移交修复工坊");
  return {
    next: replaceHandover(db, updated),
    result: ok(
      refs.length > 0
        ? `${item?.code} 已拆卸（下游 ${refs.length} 件引用已由临时支撑承担）。`
        : `${item?.code} 已拆卸，无在架下游引用。`
    ),
  };
}

export interface ReinstallPayload {
  direction: string;
  replacementWood: string;
  replacementSection: string;
}

/** 归安登记：更换单校验替换件木材 / 截面与原构件一致；方向不符退回待校正 */
export function reinstall(db: Db, handoverId: string, payload: ReinstallPayload): OpOutcome {
  const h = db.handovers.find((x) => x.id === handoverId);
  if (!h || !isOpen(h)) return { result: fail("交接单不存在或已闭环。") };
  if (h.status !== "已拆卸") return { result: fail(`交接单当前为「${h.status}」，不可登记归安。`) };

  const item = componentByKey(db, h.componentKey) as ComponentItem;

  if (h.mode === "原材更换") {
    if (normalizeWood(payload.replacementWood) !== normalizeWood(item.wood)) {
      return {
        result: fail(
          `归安被拒绝：替换件木材「${payload.replacementWood.trim() || "（空）"}」与原构件「${item.wood}」不一致。本次操作未落库。`
        ),
      };
    }
    if (normalizeSection(payload.replacementSection) !== normalizeSection(item.section)) {
      return {
        result: fail(
          `归安被拒绝：替换件截面「${payload.replacementSection.trim() || "（空）"}」与原构件「${item.section}」不一致。本次操作未落库。`
        ),
      };
    }
  }

  if (!payload.direction) return { result: fail("请选择归安实际方向。") };

  const base: Handover =
    h.mode === "原材更换"
      ? {
          ...h,
          replacementWood: normalizeWood(payload.replacementWood),
          replacementSection: normalizeSection(payload.replacementSection),
          actualDirection: payload.direction,
        }
      : { ...h, actualDirection: payload.direction };

  if (payload.direction !== item.direction) {
    const updated = pushLog(
      { ...base, status: "待校正" },
      `归安方向不符（实际 ${payload.direction} / 要求 ${item.direction}），退回待校正`
    );
    return {
      next: replaceHandover(db, updated),
      result: ok(
        `归安方向不符：实际「${payload.direction}」与要求「${item.direction}」不一致，交接单 ${h.id} 已退回待校正，须校正确认后方可闭环。`,
        "info"
      ),
    };
  }

  const updated = pushLog({ ...base, status: "待闭环" }, `归安方向核验相符（${payload.direction}）`);
  return {
    next: replaceHandover(db, updated),
    result: ok(`归安方向核验相符（${payload.direction}），交接单 ${h.id} 进入待闭环。`),
  };
}

/** 校正确认：待校正 → 待闭环 */
export function confirmCorrection(db: Db, handoverId: string, note: string): OpOutcome {
  const h = db.handovers.find((x) => x.id === handoverId);
  if (!h || !isOpen(h)) return { result: fail("交接单不存在或已闭环。") };
  if (h.status !== "待校正") return { result: fail(`交接单当前为「${h.status}」，无需校正确认。`) };
  const text = note.trim();
  if (!text) return { result: fail("请填写校正说明（校正人、复核结果）。") };

  const updated = pushLog(
    { ...h, status: "待闭环", correctionNote: text },
    `校正确认：${text}`
  );
  return {
    next: replaceHandover(db, updated),
    result: ok(`交接单 ${h.id} 校正确认完成，进入待闭环。`),
  };
}

/** 闭环：仅待闭环状态可闭环 */
export function closeHandover(db: Db, handoverId: string): OpOutcome {
  const h = db.handovers.find((x) => x.id === handoverId);
  if (!h || !isOpen(h)) return { result: fail("交接单不存在或已闭环。") };
  if (h.status !== "待闭环") {
    return {
      result: fail(
        h.status === "待校正"
          ? `交接单 ${h.id} 尚在待校正，须校正确认后才能闭环。`
          : `交接单当前为「${h.status}」，不可闭环。`
      ),
    };
  }

  const updated = pushLog({ ...h, status: "已闭环", closedAt: timestamp() }, "交接闭环，资料归档");
  return {
    next: replaceHandover(db, updated),
    result: ok(`交接单 ${h.id} 已闭环归档。`),
  };
}
