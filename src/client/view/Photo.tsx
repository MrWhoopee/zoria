import photoUrl from '../assets/room.webp';
import { glassMaskDataUri } from '../scene/geometry.ts';

const mask = glassMaskDataUri();

export function Photo() {
  return (
    <img
      className="photo"
      src={photoUrl}
      alt=""
      draggable={false}
      style={{ maskImage: mask, WebkitMaskImage: mask, maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }}
    />
  );
}
