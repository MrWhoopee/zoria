import { useEffect, useState } from 'react';
import { getStage } from '../agent/actions.ts';
import type { Stage, StageSummary } from '../../agent/account.ts';

export function useStageTexts(stages: StageSummary[], active: boolean): ReadonlyMap<string, Stage> {
  const [texts, setTexts] = useState<ReadonlyMap<string, Stage>>(() => new Map());
  const key = stages.map((s) => `${s.id}:${s.errataAt ?? ''}:${s.acknowledgedAt ?? ''}`).join('|');

  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    const load = async (): Promise<void> => {
      const next = new Map<string, Stage>();
      for (const s of stages) {
        const full = await getStage(s.id, ctrl.signal);
        if (full) next.set(s.id, full);
      }
      if (!ctrl.signal.aborted) setTexts(next);
    };
    load().catch((err: unknown) => {
      if (!ctrl.signal.aborted) console.warn('the notebook could not load the parts:', err);
    });
    return () => ctrl.abort();
  }, [key, active]);

  return texts;
}
