import sharp from 'sharp';

const [input = 'assets-src/room-master.png', output = 'src/client/assets/room.webp'] = process.argv.slice(2);
const info = await sharp(input).webp({ quality: 82, effort: 6 }).toFile(output);
console.log(`${output}: ${info.width}x${info.height}, ${Math.round(info.size / 1024)} KB`);
