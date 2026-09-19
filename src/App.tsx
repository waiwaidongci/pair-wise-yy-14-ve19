import { useEffect, useMemo, useRef, useState } from "react";
import "./styles.css";
import { useStore } from "./hooks";
import {
  addMember,
  addRelation,
  buildings as listBuildings,
  closeHandover,
  downstreamOf,
  findMember,
  fmtTime,
  inflightOf,
  joints as listJoints,
  memberById,
  memberViews,
  openHandoverOf,
  registerSupport,
  resetDemo,
  stats,
  submitCorrection,
  submitDisassembly,
  submitReinstall,
  submitTreatment,
  upstreamOf,
} from "./store";
import {
  Handover,
  Member,
  MemberViewStatus,
  OpResult,
  Severity,
  TreatmentChoice,
} from "./types";

/* ------------------------------ 文案映射 ------------------------------ */

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "危急",
  major: "较重",
  minor: "一般",
};

const STATUS_LABEL: Record<MemberViewStatus, string> = {
  installed: "在役",
  removed: "已拆卸·待处置",
  ready: "待归安",
  correction: "待校正",
  confirming: "待闭环",
};

const STAGE_LABEL: Record<Handover["stage"], string> = {
  removed: "已拆卸，待处置",
  ready_reinstall: "处置完成，待归安",
  pending_correction: "归安方向不符，待校正",
  pending_confirm: "就位待确认，可闭环",
  closed: "已闭环",
};

const STAGE_STEPS = ["拆卸登记", "构件处置", "归安就位", "方向校正", "闭环"];

function stepIndex(stage: Handover["stage"]): number {
  switch (stage) {
    case "removed":
      return 0;
    case "ready_reinstall":
      return 1;
    case "pending_correction":
      return 3;
    case "pending_confirm":
      return 3;
    case "closed":
      return 4;
  }
}

/* ------------------------------ Toast ------------------------------ */

interface Toast extends OpResult {
  id: number;
}

let toastSeq = 0;

/* ------------------------------ 主应用 ------------------------------ */

type Tab = "members" | "handovers" | "relations";

export default function App() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>("members");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [disTarget, setDisTarget] = useState<string | null>(null);

  const notify = (r: OpResult) => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { ...r, id }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4800);
  };

  const s = stats();
  const openCount = store.handovers.filter((h) => h.stage !== "closed").length;
  const closedCount = store.handovers.length - openCount;

  const [fBuilding, setFBuilding] = useState("all");
  const [fJoint, setFJoint] = useState("all");
  const [fStatus, setFStatus] = useState<"all" | MemberViewStatus>("all");
  const [fSeverity, setFSeverity] = useState<"all" | Severity>("all");
  const [fKeyword, setFKeyword] = useState("");
  const filters: FiltersState = {
    building: fBuilding,
    setBuilding: setFBuilding,
    joint: fJoint,
    setJoint: setFJoint,
    status: fStatus,
    setStatus: setFStatus,
    severity: fSeverity,
    setSeverity: setFSeverity,
    keyword: fKeyword,
    setKeyword: setFKeyword,
  };

  const goSupport = (fromId?: string, toId?: string) => {
    setPrefill({ fromId, toId });
    setTimeout(() => {
      document.getElementById("support-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };

  const [prefill, setPrefill] = useState<{
    fromId?: string;
    toId?: string;
  }>({});

  return (
    <main className="app">
      <section className="hero">
        <p>木构拆卸归安交接台 · 古建筑木构件落架修缮</p>
        <h1>拆卸 · 支撑 · 归安 · 闭环</h1>
        <span>
          构件按「建筑 + 编号」唯一建档；拆卸前若仍有下游构件引用，必须先登记临时支撑，否则整次操作拒绝且不落库；
          每件构件只能有一笔未关闭交接，重复或并发提交沿用首次结果；危急构件只能同材同截面更换；归安方向不符退回校正，确认后方可闭环。
        </span>
        <div className="hero-actions">
          <button
            onClick={() => {
              if (confirm("确定恢复为演示数据？当前登记将被清空。")) {
                resetDemo();
                notify({ ok: true, message: "已恢复演示数据" });
              }
            }}
          >
            重置演示数据
          </button>
          <span className="persist-hint">● 状态本地持久化，刷新页面后清单 / 筛选 / 统计保持一致</span>
        </div>
      </section>

      <section className="metrics">
        <Metric label="构件总数" value={s.members} sub={`${s.buildings} 栋建筑`} />
        <Metric label="未关闭交接" value={s.openHandovers} sub="一构件至多一笔" tone="primary" />
        <Metric label="拆卸离场中" value={s.removed} sub="待处置 / 待归安" tone="teal" />
        <Metric label="归安待校正" value={s.correction} sub="方向不符已退回" tone="warn" />
        <Metric label="危急构件" value={s.critical} sub="只能同材同截面更换" tone="danger" />
        <Metric label="有效临时支撑" value={s.activeSupports} sub="闭环时同步拆除" tone="slate" />
      </section>

      <div className="layout">
        <div className="side">
          <FilterPanel f={filters} />
          <SupportPanel
            prefill={prefill}
            onClearPrefill={() => setPrefill({})}
            notify={notify}
          />
        </div>

        <section className="panel content">
          <div className="tabs">
            <button
              className={tab === "members" ? "active" : ""}
              onClick={() => setTab("members")}
            >
              构件清单
            </button>
            <button
              className={tab === "handovers" ? "active" : ""}
              onClick={() => setTab("handovers")}
            >
              交接台账
              <em>{openCount}</em>
            </button>
            <button
              className={tab === "relations" ? "active" : ""}
              onClick={() => setTab("relations")}
            >
              关系清单
            </button>
          </div>

          {tab === "members" && (
            <MembersTab
              f={filters}
              notify={notify}
              onDisassemble={(id) => {
                setDisTarget(id);
              }}
              onGoSupport={goSupport}
            />
          )}
          {tab === "handovers" && (
            <HandoversTab
              notify={notify}
              openCount={openCount}
              closedCount={closedCount}
              onGoSupport={goSupport}
            />
          )}
          {tab === "relations" && <RelationsTab notify={notify} onGoSupport={goSupport} />}
        </section>
      </div>

      {disTarget && (
        <DisassemblyModal
          memberId={disTarget}
          onClose={() => setDisTarget(null)}
          notify={notify}
          onGoRegister={(fromId, toId) => {
            setDisTarget(null);
            goSupport(fromId, toId);
          }}
          onDone={() => {
            setDisTarget(null);
            setTab("handovers");
          }}
        />
      )}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.ok ? "ok" : "fail"}`}>
            <b>{t.ok ? (t.reused ? "沿用首次结果" : "操作成功") : "操作被拒绝"}</b>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "primary" | "teal" | "warn" | "danger" | "slate";
}) {
  return (
    <article className={`metric tone-${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      {sub && <em>{sub}</em>}
    </article>
  );
}

/* ------------------------------ 筛选 ------------------------------ */

interface FiltersState {
  building: string;
  setBuilding: (v: string) => void;
  joint: string;
  setJoint: (v: string) => void;
  status: "all" | MemberViewStatus;
  setStatus: (v: "all" | MemberViewStatus) => void;
  severity: "all" | Severity;
  setSeverity: (v: "all" | Severity) => void;
  keyword: string;
  setKeyword: (v: string) => void;
}

function FilterPanel({ f }: { f: FiltersState }) {
  const bs = listBuildings();
  const js = listJoints();
  return (
    <section className="panel filter-panel">
      <h2>筛选</h2>
      <label>
        <span>建筑</span>
        <select value={f.building} onChange={(e) => f.setBuilding(e.target.value)}>
          <option value="all">全部建筑</option>
          {bs.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <label>
        <span>榫卯类型</span>
        <select value={f.joint} onChange={(e) => f.setJoint(e.target.value)}>
          <option value="all">全部榫卯</option>
          {js.map((j) => (
            <option key={j}>{j}</option>
          ))}
        </select>
      </label>
      <label>
        <span>在场状态</span>
        <select
          value={f.status}
          onChange={(e) => f.setStatus(e.target.value as typeof f.status)}
        >
          <option value="all">全部状态</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>危急程度</span>
        <select
          value={f.severity}
          onChange={(e) => f.setSeverity(e.target.value as typeof f.severity)}
        >
          <option value="all">全部程度</option>
          {Object.entries(SEVERITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>编号 / 名称</span>
        <input
          placeholder="如 A-03 / 五架梁"
          value={f.keyword}
          onChange={(e) => f.setKeyword(e.target.value)}
        />
      </label>
    </section>
  );
}

/* ------------------------------ 临时支撑登记 ------------------------------ */

function SupportPanel({
  prefill,
  onClearPrefill,
  notify,
}: {
  prefill: { fromId?: string; toId?: string };
  onClearPrefill: () => void;
  notify: (r: OpResult) => void;
}) {
  const store = useStore();
  const bs = listBuildings();
  const [building, setBuilding] = useState(bs[0] ?? "");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [method, setMethod] = useState("");
  const prefilled = useRef(false);

  // 预填（来自拆卸弹窗 / 关系清单的快捷跳转）
  useEffect(() => {
    if (prefilled.current) return;
    if (prefill.fromId || prefill.toId) {
      const from = prefill.fromId ? memberById(prefill.fromId) : undefined;
      if (from) setBuilding(from.building);
      if (prefill.fromId) setFromId(prefill.fromId);
      if (prefill.toId) setToId(prefill.toId);
      prefilled.current = true;
    }
  }, [prefill.fromId, prefill.toId]);

  const inBuilding = store.members.filter((m) => m.building === building);
  const edges = fromId
    ? downstreamOf(fromId).filter((e) => {
        const t = memberById(e.toId);
        return t && t.building === building;
      })
    : [];

  const activeSupports = store.supports.filter((s) => s.status === "active");

  const submit = () => {
    const r = registerSupport(fromId, toId, method);
    notify(r);
    if (r.ok) {
      setMethod("");
      setToId("");
      onClearPrefill();
      prefilled.current = false;
    }
  };

  return (
    <section className="panel support-panel" id="support-panel">
      <h2>临时支撑登记</h2>
      <p className="hint">拆卸前，下游仍在原位的引用必须逐笔登记有效支撑。</p>
      <label>
        <span>建筑</span>
        <select
          value={building}
          onChange={(e) => {
            setBuilding(e.target.value);
            setFromId("");
            setToId("");
          }}
        >
          {bs.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <label>
        <span>拟拆卸构件（承托方）</span>
        <select value={fromId} onChange={(e) => { setFromId(e.target.value); setToId(""); }}>
          <option value="">请选择构件</option>
          {inBuilding.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} · {m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>被保护的下游构件</span>
        <select value={toId} onChange={(e) => setToId(e.target.value)} disabled={!fromId}>
          <option value="">{fromId ? "请选择下游引用" : "先选择拟拆卸构件"}</option>
          {edges.map((e) => {
            const t = memberById(e.toId)!;
            const away = !!openHandoverOf(t.id);
            const supported = store.supports.some(
              (x) => x.status === "active" && x.fromId === fromId && x.toId === t.id
            );
            return (
              <option key={e.id} value={t.id}>
                {t.code} · {t.name}
                {away ? "（已离场，无需支撑）" : supported ? "（已登记支撑）" : "（待登记）"}
              </option>
            );
          })}
        </select>
      </label>
      <label>
        <span>支撑做法</span>
        <input
          placeholder="如：抱柱斜撑 + 千斤顶支顶梁端"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
        />
      </label>
      <button className="primary" onClick={submit} disabled={!fromId || !toId}>
        登记支撑
      </button>

      <div className="support-list">
        <h3>有效支撑（{activeSupports.length}）</h3>
        {activeSupports.length === 0 && <p className="empty">暂无有效支撑</p>}
        {activeSupports.map((s) => {
          const a = memberById(s.fromId);
          const b = memberById(s.toId);
          return (
            <div key={s.id} className="support-item">
              <b>{s.code}</b>
              <span>
                {a?.building} · {a?.code} → 保护 {b?.code} {b?.name}
              </span>
              <small>{s.method}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------ 构件清单 ------------------------------ */

function MembersTab({
  f,
  notify,
  onDisassemble,
  onGoSupport,
}: {
  f: FiltersState;
  notify: (r: OpResult) => void;
  onDisassemble: (id: string) => void;
  onGoSupport: (fromId: string, toId?: string) => void;
}) {
  const store = useStore();
  const [showForm, setShowForm] = useState(false);

  const views = useMemo(() => {
    const kw = f.keyword.trim().toLowerCase();
    return memberViews().filter((v) => {
      if (f.building !== "all" && v.member.building !== f.building) return false;
      if (f.joint !== "all" && v.member.joint !== f.joint) return false;
      if (f.status !== "all" && v.status !== f.status) return false;
      if (f.severity !== "all" && v.member.severity !== f.severity) return false;
      if (
        kw &&
        !`${v.member.code} ${v.member.name}`.toLowerCase().includes(kw)
      )
        return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, f.building, f.joint, f.status, f.severity, f.keyword]);

  return (
    <>
      <div className="heading">
        <div>
          <p>构件台账</p>
          <h2>构件清单（{views.length}）</h2>
        </div>
        <button onClick={() => setShowForm((v) => !v)}>
          {showForm ? "收起建档表单" : "+ 新增构件"}
        </button>
      </div>

      {showForm && <NewMemberForm notify={notify} onDone={() => setShowForm(false)} />}

      <div className="table-wrap">
        <table className="member-table">
          <thead>
            <tr>
              <th>建筑 / 编号</th>
              <th>构件</th>
              <th>木材 · 截面</th>
              <th>榫卯</th>
              <th>危急</th>
              <th>在场状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {views.map((v) => {
              const missing = v.status === "installed"
                ? downstreamOf(v.member.id).filter((e) => {
                    const t = memberById(e.toId);
                    if (!t || openHandoverOf(t.id)) return false;
                    return !store.supports.some(
                      (s) =>
                        s.status === "active" &&
                        s.fromId === v.member.id &&
                        s.toId === t.id
                    );
                  }).length
                : 0;
              const pending = inflightOf(v.member.id);
              return (
                <tr key={v.member.id}>
                  <td>
                    <b className="code">{v.member.code}</b>
                    <small>{v.member.building}</small>
                  </td>
                  <td>
                    <b>{v.member.name}</b>
                    <small className="disease">{v.member.disease}</small>
                  </td>
                  <td>
                    <span>{v.member.wood}</span>
                    <small>{v.member.section}</small>
                  </td>
                  <td>{v.member.joint}</td>
                  <td>
                    <span className={`badge sev-${v.member.severity}`}>
                      {SEVERITY_LABEL[v.member.severity]}
                    </span>
                  </td>
                  <td>
                    <span className={`badge st-${v.status}`}>
                      {STATUS_LABEL[v.status]}
                    </span>
                    {v.status === "installed" && missing > 0 && (
                      <small className="need-support">需先登记 {missing} 笔支撑</small>
                    )}
                  </td>
                  <td className="ops">
                    {v.status === "installed" ? (
                      <button
                        className="primary small"
                        onClick={() => onDisassemble(v.member.id)}
                        disabled={pending}
                      >
                        {pending ? "审核中…" : "申请拆卸"}
                      </button>
                    ) : (
                      <span className="link-handoff">
                        交接 {v.handover?.code}
                      </span>
                    )}
                    {v.status === "installed" && missing > 0 && (
                      <button className="small ghost" onClick={() => onGoSupport(v.member.id)}>
                        登记支撑
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {views.length === 0 && <p className="empty">没有符合筛选条件的构件</p>}
      </div>
    </>
  );
}

/* ------------------------------ 新增构件 ------------------------------ */

function NewMemberForm({
  notify,
  onDone,
}: {
  notify: (r: OpResult) => void;
  onDone: () => void;
}) {
  const [building, setBuilding] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [wood, setWood] = useState("");
  const [joint, setJoint] = useState("透榫");
  const [section, setSection] = useState("");
  const [severity, setSeverity] = useState<Severity>("minor");
  const [disease, setDisease] = useState("");
  const [advice, setAdvice] = useState("");
  const [orientation, setOrientation] = useState("");

  const dup = building.trim() && code.trim() ? !!findMember(building.trim(), code.trim()) : false;

  const save = () => {
    const r = addMember({
      building, code, name, wood, joint, section, severity, disease, advice, orientation,
    });
    notify(r);
    if (r.ok) onDone();
  };

  return (
    <div className="form-card">
      <div className="field-grid">
        <label>
          <span>建筑名称 *</span>
          <input value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="如 东华殿" />
        </label>
        <label>
          <span>构件编号 *</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="如 A-03" />
          {dup && <small className="form-error">该建筑下编号已存在（建筑+编号唯一）</small>}
        </label>
        <label>
          <span>构件名称 *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 五架梁" />
        </label>
        <label>
          <span>木材种类</span>
          <input value={wood} onChange={(e) => setWood(e.target.value)} placeholder="如 榆木" />
        </label>
        <label>
          <span>榫卯类型</span>
          <input value={joint} onChange={(e) => setJoint(e.target.value)} />
        </label>
        <label>
          <span>截面尺寸</span>
          <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="如 180×240mm" />
        </label>
        <label>
          <span>危急程度</span>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            <option value="minor">一般</option>
            <option value="major">较重</option>
            <option value="critical">危急</option>
          </select>
        </label>
        <label>
          <span>原归安方向</span>
          <input value={orientation} onChange={(e) => setOrientation(e.target.value)} placeholder="如 东西向 · 刻面朝上" />
        </label>
        <label className="span2">
          <span>病害位置</span>
          <input value={disease} onChange={(e) => setDisease(e.target.value)} />
        </label>
        <label className="span2">
          <span>修缮建议</span>
          <input value={advice} onChange={(e) => setAdvice(e.target.value)} />
        </label>
      </div>
      <button className="primary" onClick={save} disabled={dup}>
        保存构件
      </button>
    </div>
  );
}

/* ------------------------------ 拆卸申请弹窗 ------------------------------ */

function DisassemblyModal({
  memberId,
  onClose,
  notify,
  onGoRegister,
  onDone,
}: {
  memberId: string;
  onClose: () => void;
  notify: (r: OpResult) => void;
  onGoRegister: (fromId: string, toId?: string) => void;
  onDone: () => void;
}) {
  const store = useStore();
  const member = memberById(memberId);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!member) return null;
  const existing = openHandoverOf(memberId);
  const edges = downstreamOf(memberId).filter((e) => {
    const t = memberById(e.toId);
    return t && t.building === member.building;
  });

  const rows = edges.map((e) => {
    const t = memberById(e.toId)!;
    const away = !!openHandoverOf(t.id);
    const sup = store.supports.find(
      (s) => s.status === "active" && s.fromId === memberId && s.toId === t.id
    );
    return { e, t, away, sup };
  });
  const missing = rows.filter((r) => !r.away && !r.sup).length;

  const submit = async () => {
    setBusy(true);
    const r = await submitDisassembly(memberId, note);
    setBusy(false);
    notify(r);
    if (r.ok) onDone();
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p>拆卸申请</p>
            <h2>
              {member.building} · {member.code} {member.name}
            </h2>
          </div>
          <button className="ghost" onClick={onClose}>关闭</button>
        </div>

        <div className="detail-grid">
          <div><small>木材 / 截面</small><b>{member.wood} · {member.section}</b></div>
          <div><small>榫卯</small><b>{member.joint}</b></div>
          <div><small>危急程度</small><b><span className={`badge sev-${member.severity}`}>{SEVERITY_LABEL[member.severity]}</span></b></div>
          <div><small>原归安方向</small><b>{member.orientation}</b></div>
        </div>
        {member.severity === "critical" && (
          <p className="rule danger">危急构件：拆卸后只能整体更换，替换件木材与截面必须与原构件一致。</p>
        )}

        <h3>下游引用与临时支撑核对</h3>
        {rows.length === 0 ? (
          <p className="empty">该构件无下游构件引用，拆卸无需临时支撑。</p>
        ) : (
          <div className="ref-list">
            {rows.map((r) => (
              <div key={r.e.id} className={`ref-item ${r.away ? "away" : r.sup ? "ok" : "missing"}`}>
                <div>
                  <b>{r.t.code} {r.t.name}</b>
                  <small>{r.e.note}</small>
                </div>
                <div className="ref-state">
                  {r.away ? (
                    <span className="badge st-removed">已离场，无需支撑</span>
                  ) : r.sup ? (
                    <span className="badge st-installed">支撑 {r.sup.code} 有效</span>
                  ) : (
                    <>
                      <span className="badge st-correction">未登记支撑</span>
                      <button className="small" onClick={() => onGoRegister(memberId, r.t.id)}>
                        去登记
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <label className="note-field">
          <span>拆卸说明（可选）</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="拆卸顺序、现场注意事项……" />
        </label>

        {existing && (
          <p className="rule warn">
            该构件已有未关闭交接单 {existing.code}，提交将沿用首次结果，不会重复落库。
          </p>
        )}
        {missing > 0 && !existing && (
          <p className="rule danger">
            仍有 {missing} 笔引用缺少有效支撑：直接提交整次操作将被拒绝且不落库。
          </p>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={submit} disabled={busy}>
            {busy
              ? "拆卸审核中… 重复点击沿用首次结果"
              : missing > 0
                ? "仍要提交（将被拒绝）"
                : "确认提交拆卸"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 交接台账 ------------------------------ */

function HandoversTab({
  notify,
  openCount,
  closedCount,
  onGoSupport,
}: {
  notify: (r: OpResult) => void;
  openCount: number;
  closedCount: number;
  onGoSupport: (fromId: string, toId?: string) => void;
}) {
  const store = useStore();
  const open = store.handovers.filter((h) => h.stage !== "closed");
  const closed = store.handovers.filter((h) => h.stage === "closed").reverse();

  return (
    <>
      <div className="heading">
        <div>
          <p>一构件 · 一笔未关闭交接</p>
          <h2>交接台账（未关闭 {openCount} / 已闭环 {closedCount}）</h2>
        </div>
      </div>

      <div className="handover-list">
        {open.length === 0 && <p className="empty">当前没有未关闭交接单。</p>}
        {open.map((h) => (
          <HandoverCard key={h.id} h={h} notify={notify} onGoSupport={onGoSupport} />
        ))}
      </div>

      {closed.length > 0 && (
        <div className="closed-list">
          <h3>已闭环记录</h3>
          {closed.map((h) => {
            const m = memberById(h.memberId);
            return (
              <details key={h.id} className="closed-item">
                <summary>
                  <b>{h.code}</b>
                  <span>{m?.building} · {m?.code} {m?.name}</span>
                  <small>{h.closedAt ? fmtTime(h.closedAt) : ""} 闭环</small>
                </summary>
                <HandoverLogs h={h} />
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}

function HandoverCard({
  h,
  notify,
  onGoSupport,
}: {
  h: Handover;
  notify: (r: OpResult) => void;
  onGoSupport: (fromId: string, toId?: string) => void;
}) {
  const m = memberById(h.memberId);
  const step = stepIndex(h.stage);
  if (!m) return null;

  return (
    <article className="handover-card">
      <div className="handover-head">
        <div>
          <p>{h.code} · {STAGE_LABEL[h.stage]}</p>
          <h3>
            {m.building} · {m.code} {m.name}
            {h.critical && <span className="badge sev-critical">危急·只能更换</span>}
          </h3>
        </div>
        <span className="muted">发起 {fmtTime(h.createdAt)}</span>
      </div>

      <ol className="steps">
        {STAGE_STEPS.map((label, i) => (
          <li key={label} className={i <= step ? "done" : ""}>
            <i>{i + 1}</i>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      <div className="handover-cols">
        <div>
          <h4>原构件档案</h4>
          <ul className="kv">
            <li><span>木材</span><b>{h.originalWood}</b></li>
            <li><span>截面</span><b>{h.originalSection}</b></li>
            <li><span>归安方向</span><b>{h.originalOrientation}</b></li>
            {h.replacementWood && <li><span>替换件</span><b>{h.replacementWood} · {h.replacementSection}</b></li>}
            {h.reinstallOrientation && <li><span>归安记录</span><b className={h.stage === "pending_correction" ? "bad" : ""}>{h.reinstallOrientation}</b></li>}
            {h.correctionOrientation && <li><span>校正方向</span><b className="good">{h.correctionOrientation}</b></li>}
          </ul>
        </div>
        <div>
          <h4>挂接临时支撑（{h.supports.length}）</h4>
          {h.supports.length === 0 ? (
            <p className="empty">无（拆卸时无下游引用）</p>
          ) : (
            <ul className="support-snaps">
              {h.supports.map((s) => {
                const t = memberById(s.toId);
                return (
                  <li key={s.supportCode}>
                    <b>{s.supportCode}</b>
                    <span>保护 {t?.code} {t?.name}</span>
                    <small>{s.method}</small>
                  </li>
                );
              })}
            </ul>
          )}
          <button className="small ghost" onClick={() => onGoSupport(h.memberId)}>
            查看支撑登记台
          </button>
        </div>
      </div>

      <StageAction h={h} notify={notify} />
      <HandoverLogs h={h} />
    </article>
  );
}

function StageAction({ h, notify }: { h: Handover; notify: (r: OpResult) => void }) {
  if (h.stage === "removed") return <TreatmentAction h={h} notify={notify} />;
  if (h.stage === "ready_reinstall") return <ReinstallAction h={h} notify={notify} />;
  if (h.stage === "pending_correction") return <CorrectionAction h={h} notify={notify} />;
  if (h.stage === "pending_confirm")
    return (
      <div className="stage-action">
        <p className="rule ok">归安就位且方向一致，可闭环；闭环后同步拆除挂接支撑，构件恢复在役。</p>
        <button className="primary" onClick={() => notify(closeHandover(h.id))}>
          确认闭环
        </button>
      </div>
    );
  return null;
}

function TreatmentAction({ h, notify }: { h: Handover; notify: (r: OpResult) => void }) {
  const [choice, setChoice] = useState<TreatmentChoice>(h.critical ? "replace" : "repair");
  const [wood, setWood] = useState(h.originalWood);
  const [section, setSection] = useState(h.originalSection);

  return (
    <div className="stage-action">
      <h4>构件处置登记</h4>
      <div className="radio-row">
        <label className={choice === "repair" ? "pick" : ""}>
          <input
            type="radio"
            checked={choice === "repair"}
            disabled={h.critical}
            onChange={() => setChoice("repair")}
          />
          原位修补
        </label>
        <label className={choice === "replace" ? "pick" : ""}>
          <input type="radio" checked={choice === "replace"} onChange={() => setChoice("replace")} />
          整体更换
        </label>
      </div>
      {h.critical && <p className="rule danger">危急构件只能更换，修补选项已锁定。</p>}
      {choice === "replace" && (
        <div className="field-grid">
          <label>
            <span>替换件木材（须与原构件一致：{h.originalWood}）</span>
            <input value={wood} onChange={(e) => setWood(e.target.value)} className={wood.trim() && wood !== h.originalWood ? "input-bad" : ""} />
          </label>
          <label>
            <span>替换件截面（须一致：{h.originalSection}）</span>
            <input value={section} onChange={(e) => setSection(e.target.value)} />
          </label>
        </div>
      )}
      <button
        className="primary"
        onClick={() => notify(submitTreatment(h.id, choice, wood, section))}
      >
        登记处置结果
      </button>
    </div>
  );
}

function ReinstallAction({ h, notify }: { h: Handover; notify: (r: OpResult) => void }) {
  const [dir, setDir] = useState("");
  return (
    <div className="stage-action">
      <h4>归安就位登记</h4>
      <p className="hint">原归安方向：<b>{h.originalOrientation}</b>，方向不符将退回待校正。</p>
      <div className="inline-form">
        <input
          placeholder="记录实际归安方向"
          value={dir}
          onChange={(e) => setDir(e.target.value)}
        />
        <button
          className="primary"
          disabled={!dir.trim()}
          onClick={() => {
            const r = submitReinstall(h.id, dir);
            notify(r);
            setDir("");
          }}
        >
          提交归安
        </button>
      </div>
    </div>
  );
}

function CorrectionAction({ h, notify }: { h: Handover; notify: (r: OpResult) => void }) {
  const [dir, setDir] = useState("");
  return (
    <div className="stage-action correction-box">
      <h4>归安方向校正</h4>
      <p className="rule warn">
        归安方向「{h.reinstallOrientation}」与原方向「{h.originalOrientation}」不符，已退回待校正；
        校正确认方向一致后才能闭环。
      </p>
      <div className="inline-form">
        <input
          placeholder={`校正后方向（须为：${h.originalOrientation}）`}
          value={dir}
          onChange={(e) => setDir(e.target.value)}
        />
        <button
          className="primary"
          disabled={!dir.trim()}
          onClick={() => {
            const r = submitCorrection(h.id, dir);
            notify(r);
            if (r.ok) setDir("");
          }}
        >
          校正确认
        </button>
      </div>
    </div>
  );
}

function HandoverLogs({ h }: { h: Handover }) {
  return (
    <ul className="logs">
      {h.logs.map((l, i) => (
        <li key={i}>
          <time>{fmtTime(l.at)}</time>
          <b>{l.action}</b>
          <span>{l.detail}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ 关系清单 ------------------------------ */

function RelationsTab({
  notify,
  onGoSupport,
}: {
  notify: (r: OpResult) => void;
  onGoSupport: (fromId: string, toId?: string) => void;
}) {
  const store = useStore();
  const bs = listBuildings();
  const [building, setBuilding] = useState(bs[0] ?? "");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [note, setNote] = useState("");

  const inBuilding = store.members.filter((m) => m.building === building);
  const edges = store.edges.filter((e) => e.building === building);

  const add = () => {
    const r = addRelation(building, fromId, toId, note);
    notify(r);
    if (r.ok) {
      setFromId("");
      setToId("");
      setNote("");
    }
  };

  return (
    <>
      <div className="heading">
        <div>
          <p>承托关系（有向）</p>
          <h2>关系清单</h2>
        </div>
        <select value={building} onChange={(e) => { setBuilding(e.target.value); setFromId(""); setToId(""); }}>
          {bs.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </div>

      <div className="form-card relation-form">
        <p className="hint">箭头方向：承托构件 → 下游引用构件（拆卸上游前需为下游登记支撑）。</p>
        <div className="field-grid three">
          <label>
            <span>承托构件（上游）</span>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">请选择</option>
              {inBuilding.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
            </select>
          </label>
          <label>
            <span>下游构件（引用方）</span>
            <select value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">请选择</option>
              {inBuilding.filter((m) => m.id !== fromId).map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
            </select>
          </label>
          <label>
            <span>关系说明</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：柱头承托梁端" />
          </label>
        </div>
        <button className="primary" onClick={add} disabled={!fromId || !toId}>
          登记关系
        </button>
      </div>

      <div className="relation-rows">
        {edges.length === 0 && <p className="empty">该建筑暂无构件关系记录。</p>}
        {edges.map((e) => {
          const a = memberById(e.fromId);
          const b = memberById(e.toId);
          if (!a || !b) return null;
          const bAway = !!openHandoverOf(b.id);
          const sup = store.supports.find(
            (s) => s.status === "active" && s.fromId === a.id && s.toId === b.id
          );
          return (
            <div key={e.id} className="relation-row">
              <div className="rel-nodes">
                <span className="node">
                  <b>{a.code}</b> {a.name}
                </span>
                <span className="arrow">承托 →</span>
                <span className="node">
                  <b>{b.code}</b> {b.name}
                </span>
              </div>
              <small className="rel-note">{e.note}</small>
              <div className="rel-state">
                {bAway ? (
                  <span className="badge st-removed">下游已离场</span>
                ) : sup ? (
                  <span className="badge st-installed">支撑 {sup.code}</span>
                ) : (
                  <>
                    <span className="badge st-correction">缺支撑</span>
                    <button className="small" onClick={() => onGoSupport(a.id, b.id)}>
                      登记支撑
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="upstream-summary">
        <h3>按构件查看引用</h3>
        {inBuilding.map((m) => {
          const downs = downstreamOf(m.id);
          const ups = upstreamOf(m.id);
          return (
            <details key={m.id}>
              <summary>
                <b>{m.code} {m.name}</b>
                <span>承托 {downs.length} 件 / 被 {ups.length} 件引用</span>
              </summary>
              <ul className="ref-summary">
                {downs.map((e) => {
                  const t = memberById(e.toId);
                  return <li key={e.id}>↓ 承托 {t?.code} {t?.name}</li>;
                })}
                {ups.map((e) => {
                  const t = memberById(e.fromId);
                  return <li key={e.id}>↑ 被 {t?.code} {t?.name} 承托</li>;
                })}
              </ul>
            </details>
          );
        })}
      </div>
    </>
  );
}
