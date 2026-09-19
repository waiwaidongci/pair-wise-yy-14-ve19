// 演示种子数据：三栋建筑、十条构件、四笔交接（覆盖各状态）

import { Db, Handover, keyOf } from "./domain";

const c = (
  building: string,
  code: string,
  wood: string,
  joint: string,
  section: string,
  critical: boolean,
  direction: string,
  dependsOn: string[],
  note: string
) => ({
  key: keyOf(building, code),
  building,
  code,
  wood,
  joint,
  section,
  critical,
  direction,
  dependsOn,
  note,
});

export function seedDb(): Db {
  const components = [
    // 文昌阁：柱 → 梁 → 斗拱 → 椽 的荷载链
    c("文昌阁", "WCG-Z01", "楠木", "箍头榫", "240×240", false, "榫头朝北", [], "前檐柱"),
    c("文昌阁", "WCG-Z02", "楠木", "箍头榫", "240×240", true, "榫头朝北", [], "金柱 · 柱脚糟朽"),
    c("文昌阁", "WCG-L01", "杉木", "透榫", "180×240", false, "榫头朝东", [keyOf("文昌阁", "WCG-Z01"), keyOf("文昌阁", "WCG-Z02")], "五架梁"),
    c("文昌阁", "WCG-D01", "柏木", "半榫", "120×180", false, "翘头朝南", [keyOf("文昌阁", "WCG-L01")], "柱头科斗拱"),
    c("文昌阁", "WCG-C01", "杉木", "燕尾榫", "80×100", false, "榫头朝西", [keyOf("文昌阁", "WCG-D01")], "檐椽"),
    // 祖师殿
    c("祖师殿", "ZSD-Z01", "柏木", "箍头榫", "260×260", false, "榫头朝北", [], "前檐柱"),
    c("祖师殿", "ZSD-L01", "杉木", "透榫", "200×260", true, "榫头朝东", [keyOf("祖师殿", "ZSD-Z01")], "大梁 · 端部开裂"),
    c("祖师殿", "ZSD-D01", "楠木", "半榫", "130×190", false, "翘头朝南", [keyOf("祖师殿", "ZSD-L01")], "补间斗拱"),
    // 山门
    c("山门", "SM-Z01", "杉木", "箍头榫", "220×220", false, "榫头朝北", [], "门柱"),
    c("山门", "SM-L01", "杉木", "燕尾榫", "160×220", false, "榫头朝西", [keyOf("山门", "SM-Z01")], "门额"),
  ];

  const handovers: Handover[] = [
    {
      // 危急构件更换单：下游 ZSD-D01 在架且未登记支撑 → 拆卸将被整体拒绝
      id: "JJ-0001",
      componentKey: keyOf("祖师殿", "ZSD-L01"),
      mode: "原材更换",
      status: "待拆卸",
      createdAt: "2026-09-17 09:20:11",
      log: [{ at: "2026-09-17 09:20:11", text: "发起交接（原材更换）：危急构件，待勘定替换件" }],
    },
    {
      // 已登记临时支撑：拆卸可放行
      id: "JJ-0002",
      componentKey: keyOf("文昌阁", "WCG-D01"),
      mode: "修缮归安",
      status: "待拆卸",
      supportNote: "龙门架两组顶托檐椽，钢管支撑一道",
      supportAt: "2026-09-18 10:05:42",
      createdAt: "2026-09-18 08:31:07",
      log: [
        { at: "2026-09-18 08:31:07", text: "发起交接（修缮归安）" },
        { at: "2026-09-18 10:05:42", text: "登记临时支撑：龙门架两组顶托檐椽，钢管支撑一道" },
      ],
    },
    {
      // 归安方向不符被退回：待校正确认
      id: "JJ-0003",
      componentKey: keyOf("祖师殿", "ZSD-D01"),
      mode: "修缮归安",
      status: "待校正",
      actualDirection: "翘头朝北",
      createdAt: "2026-09-18 14:12:55",
      log: [
        { at: "2026-09-18 14:12:55", text: "发起交接（修缮归安）" },
        { at: "2026-09-18 15:40:02", text: "登记临时支撑：门式脚手架一道" },
        { at: "2026-09-18 16:02:37", text: "拆卸完成，构件移交修复工坊" },
        { at: "2026-09-19 09:15:20", text: "归安方向不符（实际 翘头朝北 / 要求 翘头朝南），退回待校正" },
      ],
    },
    {
      // 已闭环的历史交接
      id: "JJ-0004",
      componentKey: keyOf("山门", "SM-L01"),
      mode: "修缮归安",
      status: "已闭环",
      supportNote: "门式支撑两道",
      supportAt: "2026-09-15 09:02:18",
      actualDirection: "榫头朝西",
      createdAt: "2026-09-15 08:44:30",
      closedAt: "2026-09-16 17:21:09",
      log: [
        { at: "2026-09-15 08:44:30", text: "发起交接（修缮归安）" },
        { at: "2026-09-15 09:02:18", text: "登记临时支撑：门式支撑两道" },
        { at: "2026-09-15 10:27:45", text: "拆卸完成，构件移交修复工坊" },
        { at: "2026-09-16 16:58:11", text: "归安方向核验相符（榫头朝西）" },
        { at: "2026-09-16 17:21:09", text: "交接闭环，资料归档" },
      ],
    },
  ];

  return { components, handovers, seq: 5 };
}
