import { orderCap } from '@zoria/protocol';
import type { ChannelCfg, Observe, Order, Verdict } from '@zoria/protocol';
import { allocate } from './allocate.ts';
import type { DecisionRecord } from './decisions.ts';
import type { Links } from './map/links.ts';
import { cfg } from './map/valley.ts';
import type { Valley } from './map/valley.ts';
import { expand } from './plans/expand.ts';
import { guard } from './plans/guard.ts';
import { auction } from './plans/auction.ts';
import { general, reserved } from './general.ts';
import { jam } from './plans/jam.ts';
import { pact } from './plans/pact.ts';
import { keepalive } from './plans/keepalive.ts';
import { newMemo } from './plans/types.ts';
import { presetAt, scheduleOf } from './preset.ts';
import type { Schedule } from './preset.ts';
import type { Advisor, Ctx, Memo, Task } from './plans/types.ts';
import { yard } from './plans/yard.ts';
import { World } from './world.ts';

export const THINK_LIMIT_MS = 300;

export interface BrainStats {
  errors: number;
  lastError: string;
  skipped: number;
}

export class Brain {
  readonly world: World;
  readonly memo: Memo = newMemo();
  readonly stats: BrainStats = { errors: 0, lastError: '', skipped: 0 };
  private readonly ctx: Ctx;
  private readonly advisors: Advisor[];
  private readonly clock: () => number;
  private readonly schedule: Schedule;
  private sent: Task[] = [];
  private sentAt = 0;
  private record: DecisionRecord = { t: 0, preset: '', offered: 0, errors: 0, chosen: [] };

  constructor(v: Valley, links: Links, advisors: Advisor[] = [general, yard, guard, expand, jam, pact, auction], clock: () => number = () => performance.now(), schedule: Schedule = scheduleOf('основний')) {
    this.world = new World(v);
    this.schedule = schedule;
    this.ctx = { v, w: this.world, links, memo: this.memo, preset: presetAt(schedule, 0) };
    this.advisors = advisors;
    this.clock = clock;
  }

  tick(obs: Observe): Order[] {
    const t0 = this.clock();
    const errorsBefore = this.stats.errors;
    this.world.update(obs);
    this.ctx.preset = presetAt(this.schedule, this.world.t);
    const tasks: Task[] = [];
    for (const advise of this.advisors) {
      if (this.clock() - t0 > THINK_LIMIT_MS) {
        this.stats.skipped++;
        break;
      }
      try {
        tasks.push(...advise(this.ctx));
      } catch (e) {
        this.stats.errors++;
        this.stats.lastError = e instanceof Error ? e.message : String(e);
      }
    }
    const w = this.world;
    const v = this.ctx.v;
    const hold = reserved(this.memo.general);
    const open = tasks.filter((t) => t.tag.startsWith('general:') || t.unit === null || !hold.has(t.unit));
    const chosen = allocate(open, {
      chan: w.chan,
      cap: orderCap(v.cfg as unknown as ChannelCfg, w.chanAt),
      energy: w.energy,
      reserve: w.units.filter((u) => u.task !== null).length * cfg(v, 'chanTick'),
    });
    const alive = keepalive(this.ctx, chosen);
    if (alive) chosen.push(alive);
    for (const t of chosen) t.commit(this.memo, w.t);
    this.sent = chosen;
    this.sentAt = w.t;
    this.record = { t: w.t, preset: this.ctx.preset.name, offered: tasks.length, errors: this.stats.errors - errorsBefore, chosen: chosen.map((c) => ({ tag: c.tag, unit: c.unit, value: c.value, order: c.order })) };
    return chosen.map((t) => t.order);
  }

  decisions(): DecisionRecord {
    return this.record;
  }

  feedback(verdicts: Verdict[]): void {
    for (const [i, ok, code] of verdicts) {
      const task = this.sent[i];
      if (!task) continue;
      if (ok) this.memo.lastAccepted = this.sentAt;
      else task.refused(this.memo, code);
    }
  }
}
