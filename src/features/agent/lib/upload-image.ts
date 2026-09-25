import sharp from 'sharp';

/**
 * 本地图片上传的校验与解析（server-only）。
 *
 * 纪律：仅凭扩展名/mime 不足以判定图片，必须做魔数校验（防改扩展名绕过）。
 * 尺寸读取用 sharp（已是依赖）；读失败降级为 null（前端回退 /raw 加载读 naturalWidth）。
 */

/** 上传单张图片字节上限（10MB），与图片编辑 I2I 上限一致 */
export const MAX_UPLOAD_IMAGE_BYTES = 10 * 1024 * 1024;

/** 接受的图片 mime（原样存储，不转码） */
export const ACCEPTED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type UploadImageType = 'png' | 'jpeg' | 'webp';

/** mime → OSS 对象扩展名 */
const MIME_TO_EXT: Record<UploadImageType, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp'
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
// WebP: 'RIFF' .... 'WEBP'（前 4 字节 RIFF，第 8..12 字节 WEBP）
const RIFF_MAGIC = Buffer.from('RIFF', 'ascii');
const WEBP_MAGIC = Buffer.from('WEBP', 'ascii');

/**
 * 按魔数判定真实图片类型（不信任扩展名/mime）。
 * @returns 命中的类型；非受支持图片返回 null。
 */
export function detectImageType(buffer: Buffer): UploadImageType | null {
  if (buffer.byteLength < 12) return null;
  if (buffer.subarray(0, 4).equals(PNG_MAGIC)) return 'png';
  if (buffer.subarray(0, 3).equals(JPEG_MAGIC)) return 'jpeg';
  if (buffer.subarray(0, 4).equals(RIFF_MAGIC) && buffer.subarray(8, 12).equals(WEBP_MAGIC)) {
    return 'webp';
  }
  return null;
}

/** 真实图片类型 → OSS 扩展名（png/jpg/webp） */
export function imageTypeToExt(type: UploadImageType): string {
  return MIME_TO_EXT[type];
}

/** 真实图片类型 → 规范 mime（用于落库与 OSS Content-Type） */
export function imageTypeToMime(type: UploadImageType): string {
  return type === 'png' ? 'image/png' : type === 'jpeg' ? 'image/jpeg' : 'image/webp';
}

/**
 * 用 sharp 读取图片自然尺寸；失败（损坏/不支持）降级为 null，不阻断上传。
 */
export async function readImageDimensions(
  buffer: Buffer
): Promise<{ width: number; height: number } | null> {
  try {
    const meta = await sharp(buffer).metadata();
    if (meta.width && meta.height) {
      return { width: meta.width, height: meta.height };
    }
    return null;
  } catch (error) {
    console.warn('[agent] sharp failed to read image dimensions:', error);
    return null;
  }
}
