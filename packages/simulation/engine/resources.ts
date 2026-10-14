import type { Actor } from "../actor";
import type { ResourceRule } from "./types";

/** Whether the caster can pay `cost` now. Heat refuses costs that would pass the ceiling. */
export function canAfford(rule: ResourceRule, p: Actor, cost: number): boolean {
  return rule.mode === "spend"
    ? p.resource >= cost
    : cost <= 0 || p.resource + cost <= rule.max;
}

export function pay(rule: ResourceRule, p: Actor, cost: number) {
  p.resource = Math.max(
    0,
    Math.min(rule.max, p.resource + (rule.mode === "heat" ? cost : -cost)),
  );
}

export function gain(rule: ResourceRule, p: Actor, amount: number) {
  p.resource = Math.min(rule.max, p.resource + amount);
}
