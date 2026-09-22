import { formatFromExtension, toMarkdownBytes } from '@firecrawl/anydoc';
import { MAX_DOCUMENT_BYTES } from '../constants/knowledge';
import { htmlToText } from './chunk';

/**
 * 文件解析管线（server-only）：上传文件字节 → 结构化 Markdown / 纯文本。
 *
 * 分派策略：
 * - md / txt / html 本就是文本 → 零依赖（UTF-8 decode / 去 frontmatter / htmlToText）；
 * - office / pdf / epub / rtf / csv → @firecrawl/anydoc（napi 原生模块，纯本地解析，
 *   基于内容签名检测格式，扩展名仅作无签名格式（CSV）的兜底提示）。
 *
 * 所有失败路径统一抛 KnowledgeExtractError（携带 code + 面向用户的中文消息），
 * 由 Route Handler 经 extractErrorStatus 映射为 4xx 错误信封。
 */

export type ExtractErrorCode =
  | 'unsupported_type'
  | 'empty_text'
  | 'encrypted'
  | 'needs_ocr'
  | 'parse_failed'
  | 'too_large';

export class KnowledgeExtractError extends Error {
  readonly code: ExtractErrorCode;

  constructor(code: ExtractErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'KnowledgeExtractError';
    this.code = code;
  }
}

/** 允许上传的文件扩展名（后端白名单强制校验；前端 accept 由 KNOWLEDGE_FILE_ACCEPT 单独维护） */
export const ACCEPTED_FILE_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'docm',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'odt',
  'ods',
  'odp',
  'rtf',
  'epub',
  'csv',
  'md',
  'markdown',
  'txt',
  'html',
  'htm'
] as const;

/** 校验类错误 → HTTP 语义映射（与 ingestErrorStatus 同构） */
export function extractErrorStatus(code: ExtractErrorCode): {
  status: number;
  code: 'invalid_request' | 'payload_too_large';
} {
  return code === 'too_large'
    ? { status: 413, code: 'payload_too_large' }
    : { status: 400, code: 'invalid_request' };
}

/** 文件名去扩展名（上传未填标题时的默认标题来源） */
export function fileBaseName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dotIndex = base.lastIndexOf('.');
  return dotIndex > 0 ? base.slice(0, dotIndex) : base;
}

/** 去除 md 开头 `--- ... ---` 的 YAML frontmatter（纯正则，零依赖） */
export function stripFrontmatter(text: string): string {
  return text.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

/** anydoc 错误码（v0.2.x 为小写驼峰）→ 用户可读中文消息；原始 error 作为 cause 保留供排查 */
function mapConvertError(error: unknown): KnowledgeExtractError {
  const code = (error as { code?: string } | null)?.code;
  const cause = { cause: error };
  switch (code) {
    case 'needsOcr':
      return new KnowledgeExtractError(
        'needs_ocr',
        '未提取到文本：该文档是扫描件/图片型 PDF，暂不支持（未启用 OCR）',
        cause
      );
    case 'encrypted':
      return new KnowledgeExtractError('encrypted', '文档已加密，无法解析', cause);
    case 'unsupported':
      return new KnowledgeExtractError('unsupported_type', '不支持的文件类型', cause);
    case 'resourceLimit':
      return new KnowledgeExtractError('too_large', '文档过大或结构过深，无法解析', cause);
    case 'malformed':
    case 'missingPart':
      return new KnowledgeExtractError(
        'parse_failed',
        '文档解析失败：文件已损坏或结构不完整',
        cause
      );
    default:
      return new KnowledgeExtractError('parse_failed', '文档解析失败，请确认文件可正常打开', cause);
  }
}

/** office / pdf / epub / rtf / csv → 结构化 GFM Markdown（anydoc 内容签名检测；不启用联网 OCR） */
async function anydocToMarkdown(buffer: Buffer, ext: string): Promise<string> {
  try {
    // 内容签名检测格式，扩展名标错也能识别；CSV 无签名需显式声明。
    // Buffer 本身即 Uint8Array，直接传入避免额外拷贝（上传上限 10MB）。
    const format = ext === 'csv' ? formatFromExtension(ext) : null;
    return await toMarkdownBytes(buffer, format);
  } catch (error) {
    // 保留 anydoc 原始错误细节（error.message 指明出问题的包内部件；needsOcr 附页码）供排查
    const detail = error as { code?: string; pages?: number[]; pageCount?: number };
    console.error('[knowledge] anydoc parse failed:', {
      ext,
      code: detail?.code,
      message: error instanceof Error ? error.message : String(error),
      ...(detail?.code === 'needsOcr' ? { pages: detail.pages, pageCount: detail.pageCount } : {})
    });
    throw mapConvertError(error);
  }
}

/** 提取文本统一后置校验：空文本不建文档行；超 100KB 拒绝入库（本期不做分卷） */
function assertText(text: string): string {
  const normalized = text.trim();
  if (!normalized) {
    throw new KnowledgeExtractError('empty_text', '未提取到文本：文档内容为空');
  }
  if (Buffer.byteLength(normalized, 'utf8') > MAX_DOCUMENT_BYTES) {
    throw new KnowledgeExtractError('too_large', '提取的文本超过 100KB 上限，请精简文档后重试');
  }
  return normalized;
}

/**
 * 上传文件 → Markdown / 纯文本。
 * 扩展名仅用于纯文本类分支与 CSV 显式声明；白名单校验在端点完成，
 * 不在名单内的扩展名走 anydoc 内容检测，无法识别时报 unsupported_type。
 */
export async function extractTextFromFile(params: {
  filename: string;
  buffer: Buffer;
}): Promise<string> {
  const ext = params.filename.split('.').pop()?.toLowerCase() ?? '';
  let text: string;
  if (ext === 'txt') {
    text = params.buffer.toString('utf8');
  } else if (ext === 'md' || ext === 'markdown') {
    text = stripFrontmatter(params.buffer.toString('utf8'));
  } else if (ext === 'html' || ext === 'htm') {
    text = htmlToText(params.buffer.toString('utf8'));
  } else {
    text = await anydocToMarkdown(params.buffer, ext);
  }
  return assertText(text);
}
