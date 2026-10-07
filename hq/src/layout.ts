export const PHOTO = { w: 1312, h: 816 };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x: (100 * x0) / PHOTO.w, y: (100 * y0) / PHOTO.h, w: (100 * (x1 - x0)) / PHOTO.w, h: (100 * (y1 - y0)) / PHOTO.h });

export const DEVICES = {
  board: box(470, 26, 848, 146),
  onAir: box(886, 36, 1000, 140),
  vu1: box(533, 210, 602, 262),
  vu2: box(631, 210, 698, 262),
  vu3: box(726, 210, 795, 262),
  wall: box(14, 196, 206, 292),
  left: box(282, 334, 458, 466),
  round: box(574, 312, 754, 492),
  right: box(875, 334, 1053, 466),
  reels: box(362, 528, 633, 622),
  nixie: box(686, 550, 934, 606),
  lamps: box(744, 628, 976, 656),
  keypad: box(950, 520, 1104, 622),
  knob1: box(528, 652, 602, 728),
  knob2: box(652, 652, 728, 728),
  knob3: box(952, 652, 1028, 728),
  cassettes: box(108, 646, 438, 704),
  lever: box(1052, 584, 1250, 724),
  drawer: box(2, 444, 208, 600),
} as const;

export type Device = keyof typeof DEVICES;

export function place(b: Box): Record<string, string> {
  return { left: b.x + '%', top: b.y + '%', width: b.w + '%', height: b.h + '%' };
}
