/**
 * design 预览 PNG 的 base64 解码与校验（server-only）。
 *
 * 客户端导出画布 PNG → 转 base64 随保存请求上传；此处解码并校验魔数/体积，
 * 拒绝非 PNG 或超限载荷（请求体总量另有 MAX_REQUEST_BYTES 前置拦截）。
 */

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 解码后 PNG 字节上限（3MB）；配合客户端 pixelRatio 控制，请求体总量 < 4MB */
export const MAX_PREVIEW_PNG_BYTES = 3 * 1024 * 1024;

/**
 * 解码 base64 预览 PNG，校验魔数与体积上限。
 * @throws 非 PNG / 超限 / 空内容时抛错，由调用方映射为 400。
 */
export function decodePreviewPng(base64: string): Buffer {
  // 容忍 dataURL 前缀（data:image/png;base64,）
  const payload = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const buffer = Buffer.from(payload, 'base64');
  if (buffer.byteLength === 0) {
    throw new Error('empty preview png');
  }
  if (buffer.byteLength > MAX_PREVIEW_PNG_BYTES) {
    throw new Error('preview png too large');
  }
  if (!buffer.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error('preview is not a png');
  }
  return buffer;
}
