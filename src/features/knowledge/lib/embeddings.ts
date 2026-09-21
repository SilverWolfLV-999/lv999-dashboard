import { embed, embedMany } from 'ai';
import { resolveEmbeddingModel } from '@/features/agent/api/provider';
import { EMBED_BATCH_SIZE, EMBEDDING_DIM } from '@/features/agent/constants/embedding';

/**
 * 向量化封装（server-only）：检索用单条 embed、摄取用分批 embedMany。
 *
 * 百炼 text-embedding-v4 在 OpenAI 兼容模式下单次最多 10 行（官方上限），
 * 而 @ai-sdk/openai-compatible 默认按 2048 条切分，故这里显式按 EMBED_BATCH_SIZE 分批，
 * 并以 EMBED_MAX_CONCURRENCY 限制并发，避免触发服务端 QPS 限流。
 */

/** 同时进行的批次数（个人规模下 3 路并发足够，且不易触发限流） */
const EMBED_MAX_CONCURRENCY = 3;

/** providerOptions key 为 `openaiCompatible`（provider 规范名，非自定义 name） */
const embeddingProviderOptions = { openaiCompatible: { dimensions: EMBEDDING_DIM } };

/** 维度自检：provider 未按 dimensions 返回时立即失败，避免写入与列维度不一致的向量 */
function assertDim(embedding: number[]): number[] {
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(
      `Embedding 维度不匹配：期望 ${EMBEDDING_DIM}，实际 ${embedding.length}（检查 EMBEDDING_MODEL 与 dimensions 配置）`
    );
  }
  return embedding;
}

/** 单条向量化：语义检索的 query 用 */
export async function embedQuery(value: string): Promise<number[]> {
  const { embedding } = await embed({
    model: resolveEmbeddingModel(),
    value,
    providerOptions: embeddingProviderOptions
  });
  return assertDim(embedding);
}

/**
 * 批量向量化：摄取管线用，返回顺序与入参一致。
 * 分批 + 有限并发（逐组 await），单批失败即整体失败（由调用方置文档 failed）。
 */
export async function embedTexts(values: string[]): Promise<number[][]> {
  if (values.length === 0) return [];
  const model = resolveEmbeddingModel();
  const batches: string[][] = [];
  for (let start = 0; start < values.length; start += EMBED_BATCH_SIZE) {
    batches.push(values.slice(start, start + EMBED_BATCH_SIZE));
  }

  const embeddings: number[][] = [];
  for (let start = 0; start < batches.length; start += EMBED_MAX_CONCURRENCY) {
    const group = batches.slice(start, start + EMBED_MAX_CONCURRENCY);
    const results = await Promise.all(
      group.map((batch) =>
        embedMany({ model, values: batch, providerOptions: embeddingProviderOptions })
      )
    );
    for (const result of results) {
      embeddings.push(...result.embeddings.map(assertDim));
    }
  }
  return embeddings;
}
