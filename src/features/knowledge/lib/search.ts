import { searchKnowledge } from '../api/service';
import { DEFAULT_SEARCH_TOP_K, MAX_SEARCH_TOP_K, SEARCH_MIN_SCORE } from '../constants/knowledge';
import { embedQuery } from './embeddings';

/**
 * 语义检索入口（server-only）：文本 query → embedding → pgvector cosine topK。
 *
 * 低相关片段按 SEARCH_MIN_SCORE 过滤：embedding 相似度对完全无关的文本也会给出
 * 0.1~0.3 的基线值，不过滤会把噪声塞进模型上下文（Agent 反而容易"强行引用"）。
 * 阈值偏保守，宁可漏召也不误导；调参只改常量。
 */
export async function searchKnowledgeByText(
  userId: string,
  query: string,
  topK: number = DEFAULT_SEARCH_TOP_K
) {
  const limit = Math.min(MAX_SEARCH_TOP_K, Math.max(1, Math.floor(topK)));
  const queryVector = await embedQuery(query);
  const hits = await searchKnowledge(userId, queryVector, limit);
  return hits.filter((hit) => hit.score >= SEARCH_MIN_SCORE);
}
