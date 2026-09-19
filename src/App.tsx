import { useMemo, useState, useSyncExternalStore } from "react";
import "./styles.css";
import {
  ComponentItem,
  ComponentState,
  Db,
  DIRECTIONS,
  Handover,
  HandoverMode,
  componentByKey,
  componentState,
  downstreamOf,
  isOpen,
  liveDownstream,
  openHandoverOf,
  statsOf,
} from "./domain";
import {
  OpResult,
  closeHandover,
  confirmCorrection,
  createHandover,
  dismantle,
  registerSupport,
  reinstall,
} from "./ops";
import { getDb, resetAll, runOp, subscribe } from "./store";

const project = {
  id: "hxyfront-62013",
  sourceNo: 8,
  port: 62013,
  title: "木构拆卸归安交接台",
  domain: "古建木结构",
};

const STATE_FILTERS: Array<ComponentState | "全部"> = [
  "全部",
  "无交接",
  "待拆卸",
  "已拆卸",
  "待校正",
  "待闭环",
  "已闭环",
];

const STATE_TONE: Record<string, string> = {
  无交接: "muted",
  待拆卸: "amber",
  已拆卸: "blue",
  待校正: "red",
  待闭环: "teal",
  已闭环: "green",
};

function Badge({ text, tone }: { text: string; tone: string }) {
  return <span className={`badge badge-${tone}`}>{text}</span>;
}

function stateBadge(state: ComponentState) {
  return <Badge text={state} tone={STATE_TONE[state] ?? "muted"} />;
}

function App() {
  const db = useSyncExternalStore(subscribe, getDb);
  const [flash, setFlash] = useState<OpResult | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [buildingFilter, setBuildingFilter] = useState("全部");
  const [jointFilter, setJointFilter] = useState("全部");
  const [stateFilter, setStateFilter] = useState<ComponentState | "全部">("全部");

  const buildings = useMemo(
    () => ["全部", ...Array.from(new Set(db.components.map((c) => c.building)))],
    [db]
  );
  const joints = useMemo(
    () => ["全部", ...Array.from(new Set(db.components.map((c) => c.joint)))],
    [db]
  );

  const filtered = useMemo(
    () =>
      db.components.filter(
        (c) =>
          (buildingFilter === "全部" || c.building === buildingFilter) &&
          (jointFilter === "全部" || c.joint === jointFilter) &&
          (stateFilter === "全部" || componentState(db, c.key) === stateFilter)
      ),
    [db, buildingFilter, jointFilter, stateFilter]
  );

  const stats = statsOf(db);
  const selected = selectedKey ? componentByKey(db, selectedKey) : undefined;

  const exec = (op: (db: Db) => ReturnType<typeof createHandover>) => {
    setFlash(runOp(op));
  };

  return (
    <main className="app">
      <section className="hero">
        <p>
          {project.id} · 源提示词{project.sourceNo} · Port {project.port}
        </p>
        <h1>{project.title}</h1>
        <span>
          构件以「建筑 + 编号」唯一登记。拆卸前若仍有下游构件在架引用，须先登记临时支撑，否则整次操作拒绝且不落库；
          每件构件仅允许一笔未关闭交接，重复或并发提交沿用首次结果；危急构件只能原材更换，替换件木材与截面须与原构件一致；
          归安方向不符退回待校正，校正确认后方可闭环。
        </span>
      </section>

      {flash && (
        <div className={`flash flash-${flash.tone}`} role="status">
          <span>{flash.message}</span>
          <button className="flash-close" onClick={() => setFlash(null)} aria-label="关闭">
            ×
          </button>
        </div>
      )}

      <section className="metrics">
        <article>
          <small>在册构件</small>
          <strong>{stats.total}</strong>
        </article>
        <article>
          <small>未关闭交接</small>
          <strong>{stats.open}</strong>
        </article>
        <article>
          <small>待校正</small>
          <strong>{stats.correcting}</strong>
        </article>
        <article>
          <small>已闭环</small>
          <strong>{stats.closed}</strong>
        </article>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>{project.domain}筛选</h2>
          <div className="filter-group">
            <h3>建筑</h3>
            <div className="chips">
              {buildings.map((b) => (
                <button
                  key={b}
                  className={buildingFilter === b ? "chip-active" : ""}
                  onClick={() => setBuildingFilter(b)}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <h3>榫卯类型</h3>
            <div className="chips">
              {joints.map((j) => (
                <button
                  key={j}
                  className={jointFilter === j ? "chip-active" : ""}
                  onClick={() => setJointFilter(j)}
                >
                  {j}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <h3>交接状态</h3>
            <div className="chips">
              {STATE_FILTERS.map((s) => (
                <button
                  key={s}
                  className={stateFilter === s ? "chip-active" : ""}
                  onClick={() => setStateFilter(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <h3>流程</h3>
            <p className="flow-hint">
              发起交接 → 登记临时支撑 → 拆卸 → 归安核验 →（不符退回待校正 → 校正确认）→ 闭环归档
            </p>
            <button
              className="ghost-btn"
              onClick={() => {
                setFlash(resetAll());
                setSelectedKey(null);
              }}
            >
              重置演示数据
            </button>
          </div>
        </aside>

        <section className="panel">
          <div className="heading">
            <div>
              <p>构件清单</p>
              <h2>在册构件（{filtered.length}）</h2>
            </div>
          </div>
          <div className="component-list">
            {filtered.map((c) => {
              const state = componentState(db, c.key);
              const refs = downstreamOf(db, c.key);
              const live = refs.filter((r) => r.inPlace).length;
              const open = openHandoverOf(db, c.key);
              return (
                <button
                  key={c.key}
                  className={`component-row ${selectedKey === c.key ? "row-active" : ""}`}
                  onClick={() => setSelectedKey(c.key)}
                >
                  <div className="row-main">
                    <div className="row-title">
                      <strong>{c.code}</strong>
                      <span className="row-building">{c.building}</span>
                      {c.critical && <Badge text="危急" tone="red" />}
                      {stateBadge(state)}
                    </div>
                    <p>
                      {c.wood} · {c.joint} · 截面 {c.section} · 归安方向 {c.direction}
                    </p>
                    <p className="row-note">{c.note}</p>
                  </div>
                  <div className="row-side">
                    <span className={live > 0 ? "ref-count ref-live" : "ref-count"}>
                      下游引用 {refs.length}
                      {live > 0 ? `（在架 ${live}）` : ""}
                    </span>
                    {open?.supportNote && <Badge text="支撑已登记" tone="teal" />}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="empty">当前筛选条件下无构件。</p>}
          </div>
        </section>
      </section>

      <section className="workspace workspace-bottom">
        <ConsolePanel
          key={selected ? `${selected.key}:${openHandoverOf(db, selected.key)?.id ?? "none"}:${openHandoverOf(db, selected.key)?.status ?? "none"}` : "empty"}
          db={db}
          item={selected}
          exec={exec}
        />
        <HandoverList db={db} stateFilter={stateFilter} onSelect={setSelectedKey} />
      </section>

      <RelationView db={db} filtered={filtered} />
    </main>
  );
}

/** 交接操作台：按选中构件的交接状态给出对应表单 */
function ConsolePanel({
  db,
  item,
  exec,
}: {
  db: Db;
  item: ComponentItem | undefined;
  exec: (op: (db: Db) => ReturnType<typeof createHandover>) => void;
}) {
  const [mode, setMode] = useState<HandoverMode>("修缮归安");
  const [supportNote, setSupportNote] = useState("");
  const [direction, setDirection] = useState("");
  const [repWood, setRepWood] = useState("");
  const [repSection, setRepSection] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");

  if (!item) {
    return (
      <section className="panel console">
        <div className="heading">
          <div>
            <p>交接操作台</p>
            <h2>未选中构件</h2>
          </div>
        </div>
        <p className="empty">在上方构件清单中点击一件构件，在此办理交接手续。</p>
      </section>
    );
  }

  const open = openHandoverOf(db, item.key);
  const live = liveDownstream(db, item.key);
  const effectiveMode: HandoverMode = item.critical ? "原材更换" : mode;

  return (
    <section className="panel console">
      <div className="heading">
        <div>
          <p>交接操作台</p>
          <h2>
            {item.building} · {item.code}
          </h2>
        </div>
        {item.critical && <Badge text="危急构件 · 只能更换" tone="red" />}
      </div>

      <dl className="meta-grid">
        <div>
          <dt>木材</dt>
          <dd>{item.wood}</dd>
        </div>
        <div>
          <dt>榫卯</dt>
          <dd>{item.joint}</dd>
        </div>
        <div>
          <dt>截面</dt>
          <dd>{item.section}</dd>
        </div>
        <div>
          <dt>归安方向</dt>
          <dd>{item.direction}</dd>
        </div>
      </dl>

      {!open && (
        <div className="console-block">
          <h3>发起交接</h3>
          <div className="chips">
            {(["修缮归安", "原材更换"] as HandoverMode[]).map((m) => (
              <button
                key={m}
                className={effectiveMode === m ? "chip-active" : ""}
                disabled={item.critical && m === "修缮归安"}
                title={item.critical && m === "修缮归安" ? "危急构件只能更换" : undefined}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
          {effectiveMode === "原材更换" && (
            <p className="hint">
              更换单要求替换件与原构件一致：{item.wood} · 截面 {item.section}。
            </p>
          )}
          <button
            className="primary"
            onClick={() => exec((db) => createHandover(db, item.key, effectiveMode))}
          >
            发起交接（重复提交沿用首次结果）
          </button>
        </div>
      )}

      {open && open.status === "待拆卸" && (
        <div className="console-block">
          <h3>
            交接单 {open.id} · 待拆卸 <Badge text={open.mode} tone="muted" />
          </h3>
          {live.length > 0 ? (
            <p className="warn">
              仍有 {live.length} 件下游构件在架引用：{live.map((r) => `${r.building}·${r.code}`).join("、")}
              。未登记临时支撑前拆卸将被整体拒绝。
            </p>
          ) : (
            <p className="hint">无在架下游引用，可直接拆卸。</p>
          )}
          {open.supportNote ? (
            <p className="ok-line">临时支撑已登记：{open.supportNote}</p>
          ) : (
            <label>
              <span>临时支撑方案</span>
              <input
                value={supportNote}
                placeholder="如：龙门架两组顶托下弦，钢管支撑一道"
                onChange={(e) => setSupportNote(e.target.value)}
              />
            </label>
          )}
          <div className="btn-row">
            {!open.supportNote && (
              <button onClick={() => exec((db) => registerSupport(db, open.id, supportNote))}>
                登记临时支撑
              </button>
            )}
            <button className="primary" onClick={() => exec((db) => dismantle(db, open.id))}>
              执行拆卸
            </button>
          </div>
        </div>
      )}

      {open && open.status === "已拆卸" && (
        <div className="console-block">
          <h3>
            交接单 {open.id} · 已拆卸 <Badge text={open.mode} tone="muted" />
          </h3>
          {open.mode === "原材更换" && (
            <>
              <p className="hint">替换件须与原构件一致：{item.wood} · 截面 {item.section}。</p>
              <div className="field-grid">
                <label>
                  <span>替换件木材</span>
                  <input
                    value={repWood}
                    placeholder={`应为 ${item.wood}`}
                    onChange={(e) => setRepWood(e.target.value)}
                  />
                </label>
                <label>
                  <span>替换件截面</span>
                  <input
                    value={repSection}
                    placeholder={`应为 ${item.section}`}
                    onChange={(e) => setRepSection(e.target.value)}
                  />
                </label>
              </div>
            </>
          )}
          <label>
            <span>归安实际方向（要求：{item.direction}）</span>
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="">请选择</option>
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            onClick={() =>
              exec((db) =>
                reinstall(db, open.id, {
                  direction,
                  replacementWood: repWood,
                  replacementSection: repSection,
                })
              )
            }
          >
            提交归安核验
          </button>
        </div>
      )}

      {open && open.status === "待校正" && (
        <div className="console-block">
          <h3>
            交接单 {open.id} · 待校正 <Badge text={open.mode} tone="muted" />
          </h3>
          <p className="warn">
            归安方向不符：实际「{open.actualDirection}」/ 要求「{item.direction}」。校正确认前不得闭环。
          </p>
          <label>
            <span>校正说明</span>
            <input
              value={correctionNote}
              placeholder="如：已按测绘图复位，复核人×××"
              onChange={(e) => setCorrectionNote(e.target.value)}
            />
          </label>
          <button
            className="primary"
            onClick={() => exec((db) => confirmCorrection(db, open.id, correctionNote))}
          >
            校正确认
          </button>
        </div>
      )}

      {open && open.status === "待闭环" && (
        <div className="console-block">
          <h3>
            交接单 {open.id} · 待闭环 <Badge text={open.mode} tone="muted" />
          </h3>
          <p className="ok-line">归安核验已通过{open.correctionNote ? `（校正：${open.correctionNote}）` : ""}，可闭环归档。</p>
          <button className="primary" onClick={() => exec((db) => closeHandover(db, open.id))}>
            确认闭环
          </button>
        </div>
      )}
    </section>
  );
}

/** 交接单清单 */
function HandoverList({
  db,
  stateFilter,
  onSelect,
}: {
  db: Db;
  stateFilter: ComponentState | "全部";
  onSelect: (key: string) => void;
}) {
  const list = db.handovers
    .filter((h) => stateFilter === "全部" || stateFilter === "无交接" || h.status === stateFilter)
    .slice()
    .sort((a, b) => b.id.localeCompare(a.id));

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>交接台账</p>
          <h2>交接单（{list.length}）</h2>
        </div>
      </div>
      <div className="handover-list">
        {list.map((h) => {
          const item = componentByKey(db, h.componentKey);
          return (
            <article key={h.id} className="handover-card">
              <div className="row-title">
                <strong>{h.id}</strong>
                <button className="link-btn" onClick={() => onSelect(h.componentKey)}>
                  {item ? `${item.building} · ${item.code}` : h.componentKey}
                </button>
                <Badge text={h.mode} tone="muted" />
                <Badge text={h.status} tone={STATE_TONE[h.status] ?? "muted"} />
              </div>
              <p className="row-note">
                发起 {h.createdAt}
                {h.closedAt ? ` · 闭环 ${h.closedAt}` : ""}
                {h.supportNote ? ` · 支撑：${h.supportNote}` : ""}
                {h.mode === "原材更换" && h.replacementWood
                  ? ` · 替换件：${h.replacementWood} ${h.replacementSection}`
                  : ""}
              </p>
              <ol className="timeline">
                {h.log.map((entry, i) => (
                  <li key={`${h.id}-${i}`}>
                    <time>{entry.at}</time>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
        {list.length === 0 && <p className="empty">当前筛选条件下无交接单。</p>}
      </div>
    </section>
  );
}

/** 单栋建筑的构件关系视图 */
function RelationView({ db, filtered }: { db: Db; filtered: ComponentItem[] }) {
  const byBuilding = useMemo(() => {
    const map = new Map<string, ComponentItem[]>();
    for (const c of filtered) {
      const list = map.get(c.building) ?? [];
      list.push(c);
      map.set(c.building, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>荷载传递</p>
          <h2>构件关系视图</h2>
        </div>
      </div>
      <div className="relation">
        {byBuilding.map(([building, items]) => (
          <section key={building} className="relation-building">
            <h3>{building}</h3>
            <div className="relation-grid">
              {items.map((c) => {
                const down = downstreamOf(db, c.key);
                const open = openHandoverOf(db, c.key);
                return (
                  <article key={c.key} className="relation-card">
                    <div className="row-title">
                      <strong>{c.code}</strong>
                      {stateBadge(componentState(db, c.key))}
                    </div>
                    <p>
                      上游依赖：
                      {c.dependsOn.length > 0
                        ? c.dependsOn
                            .map((k) => componentByKey(db, k)?.code ?? k)
                            .join("、")
                        : "无（基础构件）"}
                    </p>
                    <p>
                      下游引用：
                      {down.length > 0
                        ? down.map((d) => `${d.item.code}${d.inPlace ? "（在架）" : "（已拆）"}`).join("、")
                        : "无"}
                    </p>
                    <p>
                      临时支撑：
                      {open?.supportNote ? `已登记 · ${open.supportNote}` : "未登记"}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
        {byBuilding.length === 0 && <p className="empty">当前筛选条件下无构件。</p>}
      </div>
    </section>
  );
}

export default App;
