import {
  CHUNK_OVERLAP_CHARS,
  CHUNK_TARGET_CHARS,
  CHUNK_UNIT_MAX_CHARS
} from '../constants/knowledge';

/**
 * 文本切分（纯函数，无依赖）：把长文本切成约 CHUNK_TARGET_CHARS 的语义片段，
 * 相邻片段保留约 CHUNK_OVERLAP_CHARS 重叠，避免关键句被切断后检索不到。
 *
 * 策略：以「句末标点 + 换行」为原子边界累积单元（保留原分隔符，
 * 单元拼接可无损还原原文），再按目标长度打包成片段。
 */

/** 视为句子/行结束的字符（中英文标点 + 换行） */
const UNIT_TERMINATORS = new Set(['。', '！', '？', '；', '…', '!', '?', ';', '\n']);

/** 归一化：CRLF → LF、压缩 3+ 连续换行、去首尾空白 */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 按标点/换行切成原子单元；超长单元（无标点长串）按字符硬切 */
function splitUnits(text: string): string[] {
  const units: string[] = [];
  let current = '';
  for (const char of text) {
    current += char;
    if (UNIT_TERMINATORS.has(char) || current.length >= CHUNK_UNIT_MAX_CHARS) {
      units.push(current);
      current = '';
    }
  }
  if (current) units.push(current);
  return units;
}

export function chunkText(text: string): string[] {
  const units = splitUnits(normalize(text));
  const chunks: string[] = [];
  let buffer: string[] = [];
  let bufferLength = 0;

  /** 收束当前片段，并把尾部约 CHUNK_OVERLAP_CHARS 的单元留作下一片段的开头 */
  const flush = () => {
    const chunk = buffer.join('').trim();
    if (chunk) chunks.push(chunk);

    const tail: string[] = [];
    let tailLength = 0;
    for (const unit of buffer.toReversed()) {
      if (tailLength + unit.length > CHUNK_OVERLAP_CHARS) break;
      tail.unshift(unit);
      tailLength += unit.length;
    }
    buffer = tail;
    bufferLength = tailLength;
  };

  for (const unit of units) {
    // 已有内容且再放入会超目标长度 → 先收束（单个超长单元独占一片段，不再二次切分）
    if (bufferLength > 0 && bufferLength + unit.length > CHUNK_TARGET_CHARS) {
      flush();
    }
    buffer.push(unit);
    bufferLength += unit.length;
  }

  const last = buffer.join('').trim();
  if (last) chunks.push(last);
  return chunks;
}

/** HTML → 纯文本：去脚本/样式/注释与标签，块级元素转换为换行，还原常见实体 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<!--[\s\S]*?-->/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/(p|div|li|h[1-6]|tr|td|th|section|article|blockquote|pre|ul|ol|table|figure)[^>]*>/gi,
      '\n'
    )
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]{2,}/g, ' ');
}
