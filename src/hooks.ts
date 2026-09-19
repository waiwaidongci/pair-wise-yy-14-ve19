import { useSyncExternalStore } from "react";
import { getState, subscribe } from "./store";
import { AppState } from "./types";

/** 全量订阅：commit 时替换引用，刷新后状态与清单/统计保持同一快照 */
export function useStore(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}
