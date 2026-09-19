// 领域模型与派生计算：构件、交接单、依赖关系

export interface ComponentItem {
  key: string; // 唯一键：`${building}::${code}`
  building: string; // 建筑名称
  code: string; // 构件编号
  wood: string; // 木材种类
  joint: string; // 榫卯类型
  section: string; // 截面尺寸，统一展示为 180×240
  critical: boolean; // 危急构件：只能更换
  direction: string; // 归安方向要求
  dependsOn: string[]; // 上游构件 key 列表（本构件荷载落在谁身上）
  note: string; // 病害 / 部位说明
}

export type HandoverMode = "修缮归安" | "原材更换";

export type HandoverStatus = "待拆卸" | "已拆卸" | "待校正" | "待闭环" | "已闭环";

export interface HandoverLog {
  at: string;
  text: string;
}

export interface Handover {
  id: string; // JJ-0001
  componentKey: string;
  mode: HandoverMode;
  status: HandoverStatus;
  supportNote?: string; // 临时支撑登记
  supportAt?: string;
  replacementWood?: string; // 更换模式的替换件
  replacementSection?: string;
  actualDirection?: string; // 归安实际方向
  correctionNote?: string; // 校正说明
  createdAt: string;
  closedAt?: string;
  log: HandoverLog[];
}

export interface Db {
  components: ComponentItem[];
  handovers: Handover[];
  seq: number; // 交接单号序列
}

export const DIRECTIONS = [
  "榫头朝东",
  "榫头朝西",
  "榫头朝南",
  "榫头朝北",
  "翘头朝南",
  "翘头朝北",
];

export const HANDOVER_STATUSES: HandoverStatus[] = [
  "待拆卸",
  "已拆卸",
  "待校正",
  "待闭环",
  "已闭环",
];

export function keyOf(building: string, code: string): string {
  return `${building}::${code}`;
}

export function isOpen(h: Handover): boolean {
  return h.status !== "已闭环";
}

export function componentByKey(db: Db, key: string): ComponentItem | undefined {
  return db.components.find((c) => c.key === key);
}

/** 该构件当前唯一允许的未关闭交接（每件构件至多一笔） */
export function openHandoverOf(db: Db, key: string): Handover | undefined {
  return db.handovers.find((h) => h.componentKey === key && isOpen(h));
}

export function handoverById(db: Db, id: string): Handover | undefined {
  return db.handovers.find((h) => h.id === id);
}

/** 构件是否仍在架（仅“已拆卸”状态视为不在架，其余含待校正/待闭环均视为在架引用） */
export function isInPlace(db: Db, key: string): boolean {
  const open = openHandoverOf(db, key);
  return !open || open.status !== "已拆卸";
}

export interface DownstreamRef {
  item: ComponentItem;
  inPlace: boolean;
}

/** 下游构件清单：所有 dependsOn 指向 key 的构件 */
export function downstreamOf(db: Db, key: string): DownstreamRef[] {
  return db.components
    .filter((c) => c.dependsOn.includes(key))
    .map((item) => ({ item, inPlace: isInPlace(db, item.key) }));
}

/** 仍在架引用的下游构件 —— 拆卸前必须登记临时支撑的判定依据 */
export function liveDownstream(db: Db, key: string): ComponentItem[] {
  return downstreamOf(db, key)
    .filter((d) => d.inPlace)
    .map((d) => d.item);
}

export type ComponentState = HandoverStatus | "无交接";

/** 构件当前状态：有未关闭交接取交接状态，否则看历史闭环 */
export function componentState(db: Db, key: string): ComponentState {
  const open = openHandoverOf(db, key);
  if (open) return open.status;
  return db.handovers.some((h) => h.componentKey === key && !isOpen(h))
    ? "已闭环"
    : "无交接";
}

/** 截面归一化：统一乘号、去空白、小写，用于替换件一致性比对 */
export function normalizeSection(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[x×*＊✕]/g, "×")
    .replace(/\s+/g, "");
}

export function normalizeWood(s: string): string {
  return s.trim().replace(/\s+/g, "");
}

export interface Stats {
  total: number;
  open: number;
  correcting: number;
  closed: number;
}

export function statsOf(db: Db): Stats {
  return {
    total: db.components.length,
    open: db.handovers.filter(isOpen).length,
    correcting: db.handovers.filter((h) => h.status === "待校正").length,
    closed: db.handovers.filter((h) => !isOpen(h)).length,
  };
}

export function timestamp(): string {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}
