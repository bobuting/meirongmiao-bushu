import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * 生成测试用图片文件
 * Playwright 需要 input[type=file] 上传真实文件
 */
const FIXTURES_DIR = join(__dirname);

if (!existsSync(FIXTURES_DIR)) {
  mkdirSync(FIXTURES_DIR, { recursive: true });
}

// 生成最小有效 PNG 文件（1x1 红色像素）
function createMinimalPng(): Buffer {
  // PNG 签名 + IHDR + IDAT + IEND
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: 1x1, 8-bit RGB
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0);  // width
  ihdrData.writeUInt32BE(1, 4);  // height
  ihdrData[8] = 8;               // bit depth
  ihdrData[9] = 2;               // color type: RGB
  ihdrData[10] = 0;              // compression
  ihdrData[11] = 0;              // filter
  ihdrData[12] = 0;              // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk: 1x1 red pixel (filter byte 0 + R G B)
  const raw = Buffer.from([0, 255, 0, 0]); // filter=none, R=255, G=0, B=0
  const { deflateSync } = require('zlib');
  const compressed = deflateSync(raw);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const { crc32 } = require('zlib');

  const crcInput = Buffer.concat([typeBuffer, data]);
  const crcValue = crc32(crcInput);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crcValue >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

// 生成测试图片
const pngBuffer = createMinimalPng();
writeFileSync(join(FIXTURES_DIR, 'test-garment.png'), pngBuffer);
writeFileSync(join(FIXTURES_DIR, 'test-garment-2.png'), pngBuffer);
writeFileSync(join(FIXTURES_DIR, 'test-garment-3.png'), pngBuffer);

console.log('测试图片已生成到 e2e/fixtures/');