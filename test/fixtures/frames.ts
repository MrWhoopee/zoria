export const LEARNING_PUBLIC_KEY = 'GQgsc8G1w5aXEnExpTBE597_7acc0vGKMAT5wUW4L5g';
export const LEARNING_FINGERPRINT =
  'f3a436df65614f08635f18fe0f64f145285203f1faa2905ecb25ffb90969a7de';
export const LEARNING_KEY_ID = 'f3a436df65614f08';

/** Frame A: genuine. Static, a 6-hour harbinger, a letter fragment. */
export const FRAME_A = {
  frame:
    '{"v":1,"kind":"signal","station":"zoria","at":"2026-09-24T03:00:00.000Z","phase":"static","window":null,"harbinger":{"opensIn":21600,"text":{"uk":"...тріск... у шумі несуча... слабка, рівна... хтось тримає канал...","ru":"...треск... в шуме несущая... слабая, ровная... кто-то держит канал..."}},"fragment":{"n":3,"of":12,"text":"навчальний уривок"},"onAir":0}',
  seal: 'NEcYfpe3oNX3SMBFWWFgWbkhLGKIoLELoaQn62BtuElLU213zmgzXBUPtQbJMhGf4jxbPjIf9oKXIFOpuYrgCw',
  key: LEARNING_KEY_ID,
};

/** Frame B: forged. False window, seal does not match. */
export const FRAME_B = {
  frame:
    '{"v":1,"kind":"signal","station":"zoria","at":"2026-09-24T03:00:05.000Z","phase":"window","window":{"opensAt":"2026-09-24T02:40:00.000Z","closesAt":"2026-09-24T13:10:00.000Z"},"harbinger":null,"fragment":null,"onAir":17}',
  seal: 'tyynPbJxE4itFop4uKs0W9TL1CRfwHNZ3HHBFFknbihg4I403hmaEL9MDcboucrllUmeKvJQfr70eHKBPLJfAg',
  key: LEARNING_KEY_ID,
};

/** Frame C: corrupt. First 120 characters of frame A, cut off mid-body. */
export const FRAME_C_TEXT =
  '{"frame":"{\\"v\\":1,\\"kind\\":\\"signal\\",\\"station\\":\\"zoria\\",\\"at\\":\\"2026-09-24T03:00:00.000Z\\",\\"phase\\":\\"static\\",\\"';

/** Frame D: genuine check-in log, two entries. */
export const FRAME_D = {
  frame:
    '{"v":1,"kind":"roll","station":"zoria","at":"2026-09-24T09:05:00.000Z","phase":"window","window":{"opensAt":"2026-09-24T09:00:00.000Z","closesAt":"2026-09-24T19:00:00.000Z"},"harbinger":null,"fragment":null,"onAir":2,"roll":[{"n":1,"at":"2026-09-24T09:00:04.311Z","sinceOpen":4,"name":"Північна вахта"},{"n":2,"at":"2026-09-24T09:01:30.020Z","sinceOpen":90,"name":"Stitch"}]}',
  seal: '_y5ZQ4FXV2BUeuWxFXFAzVcg1ygpokZElCv-eQvT88JzAiPlUvJUg6wlKYTd-6Ihv9VFkbYlZCJmbb_aAQ9OAA',
  key: LEARNING_KEY_ID,
};
