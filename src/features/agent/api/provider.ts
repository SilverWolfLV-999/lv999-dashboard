import { createAlibaba } from '@ai-sdk/alibaba';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { EmbeddingModel, LanguageModel } from 'ai';
import { EMBEDDING_MODEL } from '../constants/embedding';
import { DEFAULT_MODEL, isModelKey, MODEL_REGISTRY, type ModelKey } from '../constants/models';

/**
 * 百炼 OpenAI 兼容端点（中国大陆 region）。
 * 注意 provider 包默认指向 dashscope-intl（新加坡），大陆账号必须覆盖为下面的地址。
 */
const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

function getApiKey(): string {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'DASHSCOPE_API_KEY is not set. Add your Aliyun Bailian (Model Studio) API key to .env.local.'
    );
  }
  return apiKey;
}

let alibabaProvider: ReturnType<typeof createAlibaba> | undefined;
let compatibleProvider: ReturnType<typeof createOpenAICompatible> | undefined;

function getAlibabaProvider() {
  if (!alibabaProvider) {
    alibabaProvider = createAlibaba({ apiKey: getApiKey(), baseURL: DASHSCOPE_BASE_URL });
  }
  return alibabaProvider;
}

function getCompatibleProvider() {
  if (!compatibleProvider) {
    compatibleProvider = createOpenAICompatible({
      name: 'dashscope',
      apiKey: getApiKey(),
      baseURL: DASHSCOPE_BASE_URL
    });
  }
  return compatibleProvider;
}

/**
 * 把内部模型 key 解析为 AI SDK 模型实例。
 * 默认走 @ai-sdk/alibaba；某模型不被支持时在注册表中改为 transport: 'compatible' 即可。
 */
export function resolveModel(key: ModelKey | string): LanguageModel {
  const modelKey: ModelKey = isModelKey(key) ? key : DEFAULT_MODEL;
  const entry = MODEL_REGISTRY[modelKey];
  const provider =
    entry.transport === 'compatible' ? getCompatibleProvider() : getAlibabaProvider();
  return provider.chatModel(entry.providerModelId);
}

/**
 * 知识库向量化模型：走百炼 OpenAI 兼容模式（同一 API Key 与 baseURL）。
 * 注意包 API 为 `embeddingModel()`（`textEmbeddingModel()` 已废弃）；
 * 维度由调用方经 providerOptions.openaiCompatible.dimensions 传入 EMBEDDING_DIM。
 */
export function resolveEmbeddingModel(): EmbeddingModel {
  return getCompatibleProvider().embeddingModel(EMBEDDING_MODEL);
}
