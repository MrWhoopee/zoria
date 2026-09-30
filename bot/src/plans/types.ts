import { orderCost } from '@zoria/protocol';
import type { ActorName, ChannelCfg, ClsName, MineUnit, Order, OrderKind } from '@zoria/protocol';
import type { Cell } from '../hex.ts';
import type { Links } from '../map/links.ts';
import type { Preset } from '../preset.ts';
import { cfg } from '../map/valley.ts';
import type { Valley } from '../map/valley.ts';
import type { World } from '../world.ts';

export interface Reservation {
  kind: 'take' | 'build' | 'feed' | 'home' | 'stage';
  cell: Cell;
  since: number;
  sent: number;
  owner?: ActorName | null;
  work?: number;
  arrived?: number;
  muted?: number;
}

export interface Memo {
  res: Map<string, Reservation>;
  pendingYard: { cls: ClsName; eta: number }[];
  lastAccepted: number;
  banned: Map<string, number>;
}

export function newMemo(): Memo {
  return { res: new Map(), pendingYard: [], lastAccepted: 0, banned: new Map() };
}

export interface Ctx {
  v: Valley;
  w: World;
  links: Links;
  memo: Memo;
  preset: Preset;
}

export interface Task {
  tag: string;
  unit: string | null;
  order: Order;
  value: number;
  bytes: number;
  energy: number;
  commit(memo: Memo, t: number): void;
  refused(memo: Memo, code: number): void;
}

export type Advisor = (ctx: Ctx) => Task[];

export function bytesFor(ctx: Ctx, kind: OrderKind, at: Cell): number {
  return orderCost(ctx.v.cfg as unknown as ChannelCfg, kind, at, ctx.w.t, ctx.v.storms);
}

export function weightOf(v: Valley, units: MineUnit[]): number {
  return units.reduce((s, u) => s + cfg(v, u.cls === 'ткач' ? 'weightTkach' : 'weightKlinok'), 0);
}

export function midStep(u: MineUnit): boolean {
  return u.wait > 0 && u.task !== null && u.task.path > 0;
}
