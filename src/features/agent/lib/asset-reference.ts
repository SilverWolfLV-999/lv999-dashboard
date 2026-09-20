import type { AssetKind } from '../api/types';

/** 对话中被显式引用的资产（输入区 chip 与提交注入共用同一形状） */
export interface ReferencedAsset {
  id: string;
  title: string;
  kind: AssetKind;
}

/**
 * 引用块的固定首行标记：Agent 指令（AGENT_INSTRUCTIONS）与此约定一一对应，
 * 模型见到该块即直接使用块内 id，无需再调 findAssets 检索。改动需同步指令文案。
 */
export const ASSET_REFERENCE_HEADER = '[引用资产]';

/** 引用行格式：`- 《标题》 kind=image id=<uuid>`（tsconfig target=ES2017，不用命名捕获组） */
const REFERENCE_LINE_PATTERN = /^- 《(.*)》 kind=(\S+) id=(\S+)$/;

export interface ParsedAssetReference {
  title: string;
  kind: string;
  id: string;
}

/**
 * 组装发送文本：有引用时在用户输入前拼接机器可读块，让模型确定性地拿到 assetId。
 * 仍是普通 text 消息（不改流式协议、不影响 validateUIMessages）。
 * 标题内的换行/连续空白归一为单空格，避免破坏逐行解析。
 */
export function buildAssetReferenceText(references: ReferencedAsset[], userText: string): string {
  if (references.length === 0) return userText;
  const lines = references.map((item) => {
    const title = item.title.replace(/\s+/g, ' ').trim();
    return `- 《${title}》 kind=${item.kind} id=${item.id}`;
  });
  return [ASSET_REFERENCE_HEADER, ...lines, '', userText].join('\n');
}

/**
 * 解析文本开头的引用块：返回引用项与剩余的用户原文。
 * 无引用块时原样返回（references 为空数组），供气泡渲染与会话标题生成共用。
 */
export function parseAssetReferenceBlock(text: string): {
  references: ParsedAssetReference[];
  text: string;
} {
  if (!text.startsWith(ASSET_REFERENCE_HEADER)) return { references: [], text };

  const separatorIndex = text.indexOf('\n\n');
  const block = separatorIndex === -1 ? text : text.slice(0, separatorIndex);
  const rest = separatorIndex === -1 ? '' : text.slice(separatorIndex + 2);

  const references: ParsedAssetReference[] = [];
  for (const line of block.split('\n').slice(1)) {
    const matched = REFERENCE_LINE_PATTERN.exec(line.trim());
    if (matched) {
      references.push({ title: matched[1], kind: matched[2], id: matched[3] });
    }
  }
  return { references, text: rest };
}

/** 去掉引用块只留用户原文（会话自动标题等不应带机器可读块的场景） */
export function stripAssetReferenceBlock(text: string): string {
  return parseAssetReferenceBlock(text).text;
}
