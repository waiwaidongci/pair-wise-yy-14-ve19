// 木构拆卸归安交接台 —— 领域模型

/** 危急程度：critical 危急 / major 较重 / minor 一般 */
export type Severity = "critical" | "major" | "minor";

/**
 * 交接阶段（同时决定构件的在场状态）：
 * removed             已拆卸，待处置
 * ready_reinstall     处置完成，待归安
 * pending_correction  归安方向不符，退回待校正
 * pending_confirm     校正/归安就位，待闭环确认
 * closed              已闭环，构件回到在役
 */
export type HandoverStage =
  | "removed"
  | "ready_reinstall"
  | "pending_correction"
  | "pending_confirm"
  | "closed";

export type TreatmentChoice = "repair" | "replace";

/** 构件 */
export interface Member {
  id: string;
  building: string; // 建筑名称
  code: string; // 构件编号（同一建筑内唯一）
  name: string; // 构件名称
  wood: string; // 木材种类
  joint: string; // 榫卯类型
  section: string; // 截面尺寸
  severity: Severity; // 危急程度
  disease: string; // 病害位置
  advice: string; // 修缮建议
  orientation: string; // 原归安方向
  createdAt: number;
}

/**
 * 构件关系（有向）：
 * from 承托 to —— 即 to（下游构件）引用 from（上游构件）。
 * 拆卸 from 前，若 to 仍在原位，必须先为该引用登记临时支撑。
 */
export interface RelationEdge {
  id: string;
  building: string;
  fromId: string; // 承托方（被引用的上游构件）
  toId: string; // 被承托方（引用方 / 下游构件）
  note?: string;
}

/** 临时支撑登记 */
export interface Support {
  id: string;
  code: string;
  building: string;
  fromId: string; // 被支顶关系中的上游构件（拟拆卸构件）
  toId: string; // 被保护的下游构件
  method: string; // 支撑做法
  status: "active" | "released";
  createdAt: number;
  releasedAt?: number;
}

/** 交接单内留存的支撑快照 */
export interface SupportSnapshot {
  supportCode: string;
  toId: string;
  method: string;
  registeredAt: number;
}

export interface HandoverLog {
  at: number;
  action: string;
  detail: string;
}

/** 拆卸归安交接单（一构件同时至多一笔未关闭） */
export interface Handover {
  id: string;
  code: string;
  building: string;
  memberId: string;
  stage: HandoverStage;
  critical: boolean; // 危急构件快照：只能更换
  originalWood: string;
  originalSection: string;
  originalOrientation: string;
  treatment?: TreatmentChoice;
  replacementWood?: string;
  replacementSection?: string;
  reinstallOrientation?: string;
  correctionOrientation?: string;
  supports: SupportSnapshot[];
  note?: string;
  logs: HandoverLog[];
  createdAt: number;
  closedAt?: number;
}

export interface AppState {
  version: 1;
  members: Member[];
  edges: RelationEdge[];
  supports: Support[];
  handovers: Handover[];
  handoverSeq: number;
  supportSeq: number;
  memberSeq: number;
  edgeSeq: number;
}

export interface OpResult {
  ok: boolean;
  message: string;
  handoverCode?: string;
  /** 重复/并发提交，沿用了首次结果 */
  reused?: boolean;
}

/** 构件在场状态（由未关闭交接单派生） */
export type MemberViewStatus =
  | "installed"
  | "removed"
  | "ready"
  | "correction"
  | "confirming";

export interface MemberView {
  member: Member;
  status: MemberViewStatus;
  handover?: Handover;
}
