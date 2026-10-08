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
  vu1: box(523, 210, 612, 279),
  vu2: box(620, 210, 709, 279),
  vu3: box(716, 210, 805, 279),
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
  drawer: box(96, 452, 200, 530),
} as const;

export type Device = keyof typeof DEVICES;

export function place(b: Box): Record<string, string> {
  return { left: b.x + '%', top: b.y + '%', width: b.w + '%', height: b.h + '%' };
}

const ROW1 = [481.25, 510.75, 539.5, 568.25, 597.5, 626.75, 665.75, 694.5, 723.75, 752.5, 781.25, 810];
const ROW2 = [486.25, 514.5, 543, 571.75, 600, 628, 665.75, 693.75, 721.75, 749.5, 777.5, 805];

export interface Group {
  box: Box;
  cells: Box[];
}

function group(lefts: number[], w: number, y0: number, y1: number): Group {
  const x0 = Math.min(...lefts);
  const x1 = Math.max(...lefts) + w;
  return { box: box(x0, y0, x1, y1), cells: lefts.map((l) => ({ x: (100 * (l - x0)) / (x1 - x0), y: 0, w: (100 * w) / (x1 - x0), h: 100 })) };
}

export const FLAPS = {
  match: group(ROW1.slice(0, 6), 24.25, 38, 86.25),
  tick: group(ROW1.slice(6), 24.25, 38, 86.25),
  focus: group(ROW2.slice(0, 6), 23, 93, 139.5),
  score: group(ROW2.slice(6), 23, 93, 139.5),
};

const TUBE_X = [715.6, 744.4, 773.2, 802.4, 831.2, 860.4, 889.2];
export const TUBES = {
  needles: group(TUBE_X.slice(0, 2).map((x) => x - 10), 20, 560, 594),
  shares: group(TUBE_X.slice(4).map((x) => x - 10), 20, 560, 594),
};

const ellipse = (cx: number, cy: number, rx: number, ry: number): Box => box(cx - rx, cy - ry, cx + rx, cy + ry);
export const REELS = [ellipse(435.2, 549.2, 55.2, 24.8), ellipse(595.6, 549, 53.6, 24.8)];

const LAMP_X = [758.5, 793, 828.5, 864.5, 900, 963.5];
export const LAMPS = LAMP_X.map((x) => ellipse(x, 643.5, 10, 9));

export const KNOBS = { knob1: ellipse(564, 681, 36, 30), knob2: ellipse(689, 681, 36, 30), knob3: ellipse(989, 682.5, 36, 30) };
export const PLATES = { knob1: box(524, 716, 604, 728), knob2: box(649, 716, 729, 728), knob3: box(928, 716, 1050, 728) };

export const DECK = { play: box(380, 597, 400, 610), step: box(403, 597, 424, 610), slider: box(392, 615, 602, 624) };
export const SCOPE = box(570, 316, 762, 496);
export const NOTE = box(788, 372, 828, 410);
export const ENGRAVE = { needles: box(700, 597, 760, 605), shares: box(785, 597, 905, 605) };
