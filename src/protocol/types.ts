export type Phase = 'static' | 'window' | 'after';

export type Harbinger = { opensIn: number; text: { uk: string; ru: string } };
export type WindowSpan = { opensAt: string; closesAt: string };
export type Fragment = { n: number; of: number; text: string };
export type RollEntry = { n: number; at: string; sinceOpen: number; name: string };

export type Frame = {
  v: number;
  kind: 'signal' | 'roll';
  station: string;
  at: string;
  phase: Phase;
  window: WindowSpan | null;
  harbinger: Harbinger | null;
  fragment: Fragment | null;
  onAir: number;
  roll?: RollEntry[];
};

export type Envelope = { frame: string; seal: string; key: string };
