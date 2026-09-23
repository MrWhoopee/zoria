import type { SampleName } from './engine.ts';
import relay from '../assets/sounds/relay.ogg';
import crtOn from '../assets/sounds/crt-on.ogg';
import crtOff from '../assets/sounds/crt-off.ogg';
import key1 from '../assets/sounds/key-1.ogg';
import key2 from '../assets/sounds/key-2.ogg';
import key3 from '../assets/sounds/key-3.ogg';
import space from '../assets/sounds/space.ogg';

export const SAMPLE_URLS: Partial<Record<SampleName, string>> = { relay, crtOn, crtOff, key1, key2, key3, space };
