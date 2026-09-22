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

/**
 * 百炼视频生成端点（DashScope 原生协议，非 OpenAI 兼容模式）。
 * @ai-sdk/alibaba 的 videoBaseURL 默认指向 dashscope-intl（新加坡）；本项目为国内 key，
 * 必须显式覆盖为经典域名 dashscope.aliyuncs.com（与图片生成通道一致）。
 */
const DASHSCOPE_VIDEO_BASE_URL = 'https://dashscope.aliyuncs.com';

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
let alibabaVideoProvider: ReturnType<typeof createAlibaba> | undefined;

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
 * 视频生成专用 provider（独立单例）：videoModel() 走 DashScope 原生端点，
 * 与对话/嵌入的 OpenAI 兼容端点隔离，故单独创建一个配置了 videoBaseURL 的实例。
 */
function getAlibabaVideoProvider() {
  if (!alibabaVideoProvider) {
    alibabaVideoProvider = createAlibaba({
      apiKey: getApiKey(),
      videoBaseURL: DASHSCOPE_VIDEO_BASE_URL
    });
  }
  return alibabaVideoProvider;
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

/**
 * 视频生成模型：走 @ai-sdk/alibaba 的 videoModel()（DashScope 原生端点，国内地域）。
 * 返回 Experimental_VideoModelV4（仅实现 doStart/doStatus，异步任务 + 轮询），
 * 交由 ai 的 experimental_generateVideo 驱动；返回类型由 SDK 推断，可直接作为其 model 入参。
 */
export function resolveVideoModel(providerModelId: string) {
  return getAlibabaVideoProvider().videoModel(providerModelId);
}
