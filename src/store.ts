import {
  AppState,
  Handover,
  HandoverLog,
  HandoverStage,
  Member,
  MemberView,
  MemberViewStatus,
  OpResult,
  RelationEdge,
  Severity,
  Support,
  SupportSnapshot,
  TreatmentChoice,
} from "./types";

const STORAGE_KEY = "mu-gou-handover-v1";

/* ------------------------------ 基础工具 ------------------------------ */

let counter = 0;
const rid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export const norm = (s: string) => s.trim().replace(/\s+/g, "").toLowerCase();

/** 木材一致判定：去除空格、全半角差异后比较 */
export const woodMatch = (a: string, b: string) => norm(a) === norm(b);

/** 截面一致判定：归一化 180×240 / 180x240 / 180X240 等写法 */
export const sectionMatch = (a: string, b: string) =>
  norm(a).replace(/×/g, "x") === norm(b).replace(/×/g, "x");

export const orientationMatch = (a: string, b: string) =>
  norm(a) === norm(b);

const now = () => Date.now();

function log(line: Omit<HandoverLog, "at">): HandoverLog {
  return { at: now(), action: line.action, detail: line.detail };
}

export function fmtTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

/* ------------------------------ 种子数据 ------------------------------ */

function seed(): AppState {
  const t = now();
  const mk = (m: Omit<Member, "id" | "createdAt">): Member => ({
    ...m,
    id: rid("m"),
    createdAt: t,
  });

  const dh = "东华殿";
  const gs = "观音阁";

  const c01 = mk({
    building: dh,
    code: "C-01",
    name: "前檐檐柱",
    wood: "楠木",
    joint: "透榫",
    section: "Φ320mm 圆柱",
    severity: "major",
    disease: "柱脚糟朽 220mm",
    advice: "建议局部墩接，墩接后归安",
    orientation: "南北向 · 柱头朝上",
  });
  const c02 = mk({
    building: dh,
    code: "C-02",
    name: "后金柱",
    wood: "楠木",
    joint: "箍头榫",
    section: "Φ340mm 圆柱",
    severity: "minor",
    disease: "表面轻微风化",
    advice: "继续监测",
    orientation: "南北向 · 柱头朝上",
  });
  const a03 = mk({
    building: dh,
    code: "A-03",
    name: "五架梁",
    wood: "榆木",
    joint: "透榫",
    section: "180×240mm",
    severity: "critical",
    disease: "梁端劈裂长 460mm，存在承载风险",
    advice: "危急构件：只能整体更换，同材同截面",
    orientation: "东西向 · 刻面朝上",
  });
  const a05 = mk({
    building: dh,
    code: "A-05",
    name: "三架梁",
    wood: "榆木",
    joint: "半榫",
    section: "150×200mm",
    severity: "minor",
    disease: "榫头轻微磨损",
    advice: "榫头修补后归安",
    orientation: "东西向 · 刻面朝上",
  });
  const d07 = mk({
    building: dh,
    code: "D-07",
    name: "平身科斗栱",
    wood: "柏木",
    joint: "燕尾榫",
    section: "120×160mm",
    severity: "minor",
    disease: "栱瓣轻微变形",
    advice: "归位校正",
    orientation: "外檐朝外",
  });

  const g01 = mk({
    building: gs,
    code: "C-01",
    name: "暗层永定柱",
    wood: "杉木",
    joint: "半榫",
    section: "Φ300mm 圆柱",
    severity: "major",
    disease: "柱身纵向细裂纹",
    advice: "灌缝加固后归安",
    orientation: "垂直 · 柱头朝上",
  });
  const g02 = mk({
    building: gs,
    code: "A-11",
    name: "草栿梁",
    wood: "松木",
    joint: "透榫",
    section: "200×280mm",
    severity: "critical",
    disease: "梁底糟朽面积较大",
    advice: "危急构件：只能整体更换，同材同截面",
    orientation: "东西向 · 原木心向上",
  });

  const members = [c01, c02, a03, a05, d07, g01, g02];

  const edge = (building: string, fromId: string, toId: string, note: string): RelationEdge => ({
    id: rid("e"),
    building,
    fromId,
    toId,
    note,
  });

  const edges = [
    edge(dh, c01.id, a03.id, "檐柱柱头承托五架梁"),
    edge(dh, c02.id, a03.id, "金柱柱头承托五架梁"),
    edge(dh, a03.id, a05.id, "五架梁背承三架梁"),
    edge(dh, a05.id, d07.id, "三架梁端联系平身科"),
    edge(gs, g01.id, g02.id, "永定柱承托草栿"),
  ];

  return {
    version: 1,
    members,
    edges,
    supports: [],
    handovers: [],
    handoverSeq: 0,
    supportSeq: 0,
    memberSeq: members.length,
    edgeSeq: edges.length,
  };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.members)) {
        return parsed;
      }
    }
  } catch {
    /* 损坏数据回退种子 */
  }
  return seed();
}

/* ------------------------------ Store ------------------------------ */

let state: AppState = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用时仍保持内存一致 */
  }
}

function commit(next: AppState) {
  state = next;
  persist();
  listeners.forEach((fn) => fn());
}

export const getState = () => state;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ------------------------------ 选择器 ------------------------------ */

export function buildings(): string[] {
  return Array.from(new Set(state.members.map((m) => m.building)));
}

export function joints(): string[] {
  return Array.from(new Set(state.members.map((m) => m.joint)));
}

/** 构件按（建筑 + 编号）查找，编号大小写不敏感 */
export function findMember(building: string, code: string): Member | undefined {
  return state.members.find(
    (m) => m.building === building && norm(m.code) === norm(code)
  );
}

export function openHandoverOf(memberId: string): Handover | undefined {
  return state.handovers.find(
    (h) => h.memberId === memberId && h.stage !== "closed"
  );
}

/** 下游构件：引用 member（member 承托它们） */
export function downstreamOf(memberId: string): RelationEdge[] {
  return state.edges.filter((e) => e.fromId === memberId);
}

/** 上游构件：member 引用的承托构件 */
export function upstreamOf(memberId: string): RelationEdge[] {
  return state.edges.filter((e) => e.toId === memberId);
}

export function memberById(id: string): Member | undefined {
  return state.members.find((m) => m.id === id);
}

const stageStatus: Record<HandoverStage, MemberViewStatus> = {
  removed: "removed",
  ready_reinstall: "ready",
  pending_correction: "correction",
  pending_confirm: "confirming",
  closed: "installed",
};

export function memberViews(): MemberView[] {
  return state.members.map((member) => {
    const h = openHandoverOf(member.id);
    return h
      ? { member, status: stageStatus[h.stage], handover: h }
      : { member, status: "installed" };
  });
}

export interface Stats {
  members: number;
  buildings: number;
  openHandovers: number;
  removed: number;
  correction: number;
  critical: number;
  activeSupports: number;
}

export function stats(): Stats {
  const views = memberViews();
  return {
    members: state.members.length,
    buildings: new Set(state.members.map((m) => m.building)).size,
    openHandovers: state.handovers.filter((h) => h.stage !== "closed").length,
    removed: views.filter((v) => v.status === "removed" || v.status === "ready").length,
    correction: views.filter((v) => v.status === "correction").length,
    critical: state.members.filter((m) => m.severity === "critical").length,
    activeSupports: state.supports.filter((s) => s.status === "active").length,
  };
}

/* ------------------------------ 业务规则 ------------------------------ */

/**
 * 拆卸前校验：仍在原位、引用该构件的下游构件，每一笔关系都必须已有有效临时支撑。
 * 返回缺失支撑的关系（用于提示应登记哪几笔支撑）。
 */
function missingSupportEdges(member: Member): RelationEdge[] {
  return downstreamOf(member.id).filter((e) => {
    const downstream = memberById(e.toId);
    if (!downstream) return false;
    // 下游构件已拆卸离场，不再压在该构件上，无需支撑
    if (openHandoverOf(e.toId)) return false;
    const hasActive = state.supports.some(
      (s) =>
        s.status === "active" && s.fromId === member.id && s.toId === e.toId
    );
    return !hasActive;
  });
}

function nextSupportCode(): string {
  const n = state.supportSeq + 1;
  return `ZC-${String(n).padStart(3, "0")}`;
}

function withHandover(
  prev: AppState,
  h: Handover,
  patch: Partial<Handover> & { log: HandoverLog }
): AppState {
  return {
    ...prev,
    handovers: prev.handovers.map((x) =>
      x.id === h.id
        ? { ...h, ...patch, logs: [...h.logs, patch.log] }
        : x
    ),
  };
}

/* 拆卸提交：进行中 / 已存在未关闭交接时沿用首次结果 */
const inflight = new Map<string, Promise<OpResult>>();

export function submitDisassembly(
  memberId: string,
  note: string
): Promise<OpResult> {
  const member = state.members.find((m) => m.id === memberId);
  if (!member) {
    return Promise.resolve({ ok: false, message: "构件不存在" });
  }

  // 1) 已有未关闭交接：沿用首次结果，不产生第二笔
  const existing = openHandoverOf(memberId);
  if (existing) {
    return Promise.resolve({
      ok: true,
      reused: true,
      handoverCode: existing.code,
      message: `该构件已有未关闭交接单 ${existing.code}，沿用首次提交结果，不重复落库`,
    });
  }

  // 2) 并发提交：复用进行中的首次结果（标记 reused，不落第二笔）
  const pending = inflight.get(memberId);
  if (pending)
    return pending.then((r) =>
      r.ok
        ? {
            ...r,
            reused: true,
            message: `并发提交：沿用首次结果 ${r.handoverCode ?? ""}，本次不落库`,
          }
        : r
    );

  const task = new Promise<OpResult>((resolve) => {
    // 模拟拆卸方案审核与现场确认的异步过程
    setTimeout(() => {
      const cur = getState();
      const nowMember = cur.members.find((m) => m.id === memberId);
      if (!nowMember) {
        inflight.delete(memberId);
        resolve({ ok: false, message: "构件不存在" });
        return;
      }
      if (openHandoverOf(memberId)) {
        // 首次在途期间已有交接落库，沿用其结果
        const h = openHandoverOf(memberId)!;
        inflight.delete(memberId);
        resolve({
          ok: true,
          reused: true,
          handoverCode: h.code,
          message: `并发提交：沿用首次结果 ${h.code}，本次不落库`,
        });
        return;
      }

      const missing = missingSupportEdges(nowMember);
      if (missing.length > 0) {
        // 整次操作拒绝且不落库
        inflight.delete(memberId);
        listeners.forEach((fn) => fn()); // 刷新“进行中”展示
        resolve({
          ok: false,
          message: `拒绝拆卸：尚有 ${missing.length} 笔下游引用未登记临时支撑（${missing
            .map((e) => {
              const d = memberById(e.toId);
              return d ? `${d.code} ${d.name}` : "";
            })
            .filter(Boolean)
            .join("、")}）。请先登记支撑后再提交。`,
        });
        return;
      }

      // 3) 落库交接单，登记阶段为 removed；快照当时有效支撑
      const snaps: SupportSnapshot[] = cur.supports
        .filter((s) => s.status === "active" && s.fromId === memberId)
        .map((s) => ({
          supportCode: s.code,
          toId: s.toId,
          method: s.method,
          registeredAt: s.createdAt,
        }));

      const seq = cur.handoverSeq + 1;
      const code = `JD-${new Date().getFullYear()}-${String(seq).padStart(
        4,
        "0"
      )}`;
      const handover: Handover = {
        id: rid("h"),
        code,
        building: nowMember.building,
        memberId,
        stage: "removed",
        critical: nowMember.severity === "critical",
        originalWood: nowMember.wood,
        originalSection: nowMember.section,
        originalOrientation: nowMember.orientation,
        supports: snaps,
        note: note.trim() || undefined,
        logs: [
          log({
            action: "拆卸登记",
            detail:
              snaps.length > 0
                ? `拆卸落库，已挂接 ${snaps.length} 笔临时支撑`
                : "拆卸落库，该构件无下游引用，无需支撑",
          }),
        ],
        createdAt: now(),
      };

      commit({
        ...cur,
        handovers: [...cur.handovers, handover],
        handoverSeq: seq,
      });
      inflight.delete(memberId);
      resolve({
        ok: true,
        handoverCode: code,
        message: `拆卸方案已通过，交接单 ${code} 落库`,
      });
    }, 650);
  });

  inflight.set(memberId, task);
  return task;
}

export function inflightOf(memberId: string): boolean {
  return inflight.has(memberId);
}

/* ------------------------------ 处置 ------------------------------ */

export function submitTreatment(
  handoverId: string,
  choice: TreatmentChoice,
  replacementWood: string,
  replacementSection: string
): OpResult {
  const h = state.handovers.find((x) => x.id === handoverId);
  if (!h) return { ok: false, message: "交接单不存在" };
  if (h.stage !== "removed")
    return { ok: false, message: "当前阶段不能登记处置结果" };

  if (h.critical && choice !== "replace") {
    return {
      ok: false,
      message: "危急构件只能更换，不允许原位修补，请选择更换并核对材质截面",
    };
  }

  if (choice === "replace") {
    if (!replacementWood.trim() || !replacementSection.trim()) {
      return { ok: false, message: "请填写替换件的木材种类与截面尺寸" };
    }
    if (!woodMatch(replacementWood, h.originalWood)) {
      return {
        ok: false,
        message: `替换件木材必须与原构件一致（原构件：${h.originalWood}）`,
      };
    }
    if (!sectionMatch(replacementSection, h.originalSection)) {
      return {
        ok: false,
        message: `替换件截面必须与原构件一致（原构件：${h.originalSection}）`,
      };
    }
  }

  const detail =
    choice === "replace"
      ? `整体更换：${replacementWood.trim()} / ${replacementSection.trim()}（与原构件一致）`
      : "原位修补，保留原构件";

  commit(
    withHandover(state, h, {
      stage: "ready_reinstall",
      treatment: choice,
      replacementWood: choice === "replace" ? replacementWood.trim() : undefined,
      replacementSection:
        choice === "replace" ? replacementSection.trim() : undefined,
      log: log({ action: "处置登记", detail }),
    })
  );
  return { ok: true, message: "处置完成，进入待归安" };
}

/* ------------------------------ 归安 ------------------------------ */

export function submitReinstall(
  handoverId: string,
  reinstallOrientation: string
): OpResult {
  const h = state.handovers.find((x) => x.id === handoverId);
  if (!h) return { ok: false, message: "交接单不存在" };
  if (h.stage !== "ready_reinstall")
    return { ok: false, message: "当前阶段不能登记归安" };
  if (!reinstallOrientation.trim())
    return { ok: false, message: "请记录归安方向" };

  const matched = orientationMatch(reinstallOrientation, h.originalOrientation);
  commit(
    withHandover(state, h, {
      stage: matched ? "pending_confirm" : "pending_correction",
      reinstallOrientation: reinstallOrientation.trim(),
      log: matched
        ? log({
            action: "归安就位",
            detail: `方向「${reinstallOrientation.trim()}」与原方向一致，待闭环确认`,
          })
        : log({
            action: "归安方向退回",
            detail: `归安方向「${reinstallOrientation.trim()}」与原方向「${h.originalOrientation}」不符，退回待校正`,
          }),
    })
  );
  return matched
    ? { ok: true, message: "归安方向一致，待闭环确认" }
    : { ok: false, message: "归安方向不符，已退回待校正" };
}

/** 校正确认：校正方向必须与原方向一致，否则仍退回 */
export function submitCorrection(
  handoverId: string,
  correctionOrientation: string
): OpResult {
  const h = state.handovers.find((x) => x.id === handoverId);
  if (!h) return { ok: false, message: "交接单不存在" };
  if (h.stage !== "pending_correction")
    return { ok: false, message: "当前阶段不在待校正" };
  if (!correctionOrientation.trim())
    return { ok: false, message: "请填写校正后的归安方向" };

  if (!orientationMatch(correctionOrientation, h.originalOrientation)) {
    commit(
      withHandover(state, h, {
        correctionOrientation: correctionOrientation.trim(),
        log: log({
          action: "校正复核未通过",
          detail: `校正方向「${correctionOrientation.trim()}」仍与原方向「${h.originalOrientation}」不符，继续待校正`,
        }),
      })
    );
    return {
      ok: false,
      message: "校正方向仍与原方向不符，请重新校正",
    };
  }

  commit(
    withHandover(state, h, {
      stage: "pending_confirm",
      correctionOrientation: correctionOrientation.trim(),
      log: log({
        action: "校正确认",
        detail: `已按「${correctionOrientation.trim()}」校正到位，待闭环确认`,
      }),
    })
  );
  return { ok: true, message: "校正确认通过，待闭环" };
}

/** 闭环：释放交接单挂接的全部临时支撑，构件回到在役 */
export function closeHandover(handoverId: string): OpResult {
  const h = state.handovers.find((x) => x.id === handoverId);
  if (!h) return { ok: false, message: "交接单不存在" };
  if (h.stage !== "pending_confirm")
    return { ok: false, message: "尚未完成归安/校正确认，不能闭环" };

  const snapCodes = new Set(h.supports.map((s) => s.supportCode));
  const t = now();
  const supports: Support[] = state.supports.map((s) =>
    snapCodes.has(s.code) && s.status === "active"
      ? { ...s, status: "released", releasedAt: t }
      : s
  );

  const released = h.supports.length;
  commit({
    ...withHandover(state, h, {
      stage: "closed",
      closedAt: t,
      log: log({
        action: "交接闭环",
        detail:
          released > 0
                ? `闭环完成，同步拆除 ${released} 笔临时支撑，构件恢复在役`
                : "闭环完成，构件恢复在役",
      }),
    }),
    supports,
  });
  return { ok: true, message: "交接单已闭环，构件恢复在役" };
}

/* ------------------------------ 临时支撑登记 ------------------------------ */

export function registerSupport(
  fromId: string,
  toId: string,
  method: string
): OpResult {
  const from = memberById(fromId);
  const to = memberById(toId);
  if (!from || !to) return { ok: false, message: "请选择支顶关系两端的构件" };
  if (from.building !== to.building)
    return { ok: false, message: "支撑关系必须位于同一栋建筑内" };
  const edgeExists = state.edges.some(
    (e) => e.fromId === fromId && e.toId === toId
  );
  if (!edgeExists)
    return { ok: false, message: "该两构件之间不存在承托关系，无需支撑" };
  if (!method.trim()) return { ok: false, message: "请填写支撑做法" };

  const dup = state.supports.some(
    (s) =>
      s.status === "active" && s.fromId === fromId && s.toId === toId
  );
  if (dup) return { ok: false, message: "该引用已有有效临时支撑，请勿重复登记" };

  const seq = state.supportSeq + 1;
  const support: Support = {
    id: rid("s"),
    code: nextSupportCode(),
    building: from.building,
    fromId,
    toId,
    method: method.trim(),
    status: "active",
    createdAt: now(),
  };
  commit({ ...state, supports: [...state.supports, support], supportSeq: seq });
  return {
    ok: true,
    message: `临时支撑 ${support.code} 已登记：${to.name} 已获支顶保护`,
  };
}

/* ------------------------------ 构件 / 关系维护 ------------------------------ */

export interface NewMemberInput {
  building: string;
  code: string;
  name: string;
  wood: string;
  joint: string;
  section: string;
  severity: Severity;
  disease: string;
  advice: string;
  orientation: string;
}

export function addMember(input: NewMemberInput): OpResult {
  if (!input.building.trim() || !input.code.trim() || !input.name.trim())
    return { ok: false, message: "建筑名称、构件编号、构件名称为必填" };
  if (findMember(input.building.trim(), input.code))
    return {
      ok: false,
      message: `「${input.building.trim()}」已存在编号 ${input.code.trim()} 的构件，构件按建筑+编号唯一`,
    };

  const member: Member = {
    id: rid("m"),
    building: input.building.trim(),
    code: input.code.trim(),
    name: input.name.trim(),
    wood: input.wood.trim() || "未记录",
    joint: input.joint.trim() || "未分类",
    section: input.section.trim() || "未记录",
    severity: input.severity,
    disease: input.disease.trim() || "无",
    advice: input.advice.trim() || "继续监测",
    orientation: input.orientation.trim() || "未记录",
    createdAt: now(),
  };
  commit({
    ...state,
    members: [...state.members, member],
    memberSeq: state.memberSeq + 1,
  });
  return { ok: true, message: `构件 ${member.building} · ${member.code} 已建档` };
}

export function addRelation(
  building: string,
  fromId: string,
  toId: string,
  note: string
): OpResult {
  const from = memberById(fromId);
  const to = memberById(toId);
  if (!from || !to) return { ok: false, message: "请选择关系两端构件" };
  if (from.building !== building || to.building !== building)
    return { ok: false, message: "关系两端必须位于所选建筑内" };
  if (fromId === toId) return { ok: false, message: "构件不能与自身建立关系" };
  if (state.edges.some((e) => e.fromId === fromId && e.toId === toId))
    return { ok: false, message: "该承托关系已存在" };
  if (state.edges.some((e) => e.fromId === toId && e.toId === fromId))
    return { ok: false, message: "两构件之间已存在反向关系" };
  if (createsCycle(fromId, toId))
    return { ok: false, message: "添加该关系会形成环向承托，拒绝登记" };

  const edge: RelationEdge = {
    id: rid("e"),
    building,
    fromId,
    toId,
    note: note.trim() || undefined,
  };
  commit({
    ...state,
    edges: [...state.edges, edge],
    edgeSeq: state.edgeSeq + 1,
  });
  return {
    ok: true,
    message: `关系已登记：${from.code} 承托 ${to.code}`,
  };
}

/** 新增 from→to 是否成环：to 原本已可（沿承托方向）到达 from */
function createsCycle(fromId: string, toId: string): boolean {
  const adj = new Map<string, string[]>();
  for (const e of state.edges) {
    const list = adj.get(e.fromId) ?? [];
    list.push(e.toId);
    adj.set(e.fromId, list);
  }
  const stack = [...(adj.get(toId) ?? [])];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === fromId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(adj.get(cur) ?? []));
  }
  return false;
}

/* ------------------------------ 重置 ------------------------------ */

export function resetDemo() {
  localStorage.removeItem(STORAGE_KEY);
  inflight.clear();
  commit(seed());
}
