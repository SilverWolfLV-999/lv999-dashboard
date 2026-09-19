/**
 * 图片模型注册表（Phase 2）—— 与 constants/models.ts（对话模型）隔离，不污染对话模型注册表。
 *
 * 图片生成直连百炼 REST（不经 AI SDK provider：@ai-sdk/alibaba 无图像模型），
 * 端点与参数结构以官方文档为准，并经 scripts/image-smoke.ts 于经典域名
 * （dashscope.aliyuncs.com）实测通过；官方新式端点为工作空间子域名
 * （{WorkspaceId}.cn-beijing.maas.aliyuncs.com），经典域名仍可正常使用。
 *
 * 2026-09-19 模型审计：升级为 3.0 系列（官方当前推荐），移除旧代条目
 * （qwen-image 首代 / qwen-image-2.0-pro / wan2.6-t2i）。实测（北京地域，经典域名）：
 * - qwen-image-3.0：~25s、0.18 元/张（默认输出 2K 档，如 1792×2400）
 * - qwen-image-3.0-pro：~35s、0.5 元/张（旗舰，复杂版面/密集小字更强）
 *
 * 协议形态：
 * - sync：POST /api/v1/services/aigc/multimodal-generation/generation
 *   → output.choices[0].message.content[0].image
 * - async-task：旧异步协议（X-DashScope-Async + 轮询 /api/v1/tasks/{id}）。
 *   3.0 系列同样支持异步接入（批量/长任务场景）；当前注册表未使用，保留代码路径备用。
 *
 * 注意：3.0 系列 enable_thinking 默认为 true，会显著增加生成耗时（实测 3-4 倍），
 * 交互式生成必须在参数中显式关闭（见 api/image-generation.ts）；
 * 返回的图片链接 24h 有效，必须立即下载转存 OSS（红线）。
 */

export type ImageModelKey = 'qwen-image-3.0' | 'qwen-image-3.0-pro';

export type ImageProtocol = 'async-task' | 'sync';

export interface ImageModelRegistryEntry {
  label: string;
  description: string;
  providerModelId: string;
  protocol: ImageProtocol;
  /** 正向提示词上限（官方推荐值；超出由服务端截断） */
  maxPromptTokens: number;
}

/** MVP 单默认模型（不做选择器）；3.0 标准版兼顾质量与速度，单价低于旧代 qwen-image */
export const DEFAULT_IMAGE_MODEL: ImageModelKey = 'qwen-image-3.0';

export const IMAGE_MODEL_REGISTRY: Record<ImageModelKey, ImageModelRegistryEntry> = {
  'qwen-image-3.0': {
    label: 'Qwen-Image 3.0',
    description: '千问图像 3.0 标准版：文字渲染稳定、复杂图文一次生成，兼顾质量与速度',
    providerModelId: 'qwen-image-3.0',
    protocol: 'sync',
    maxPromptTokens: 4500
  },
  'qwen-image-3.0-pro': {
    label: 'Qwen-Image 3.0 Pro',
    description: '千问图像 3.0 旗舰：复杂版面 / 密集小字渲染与真实质感更强（较慢、较贵）',
    providerModelId: 'qwen-image-3.0-pro',
    protocol: 'sync',
    maxPromptTokens: 4500
  }
};

export const IMAGE_MODEL_KEYS = Object.keys(IMAGE_MODEL_REGISTRY) as ImageModelKey[];

export function isImageModelKey(value: unknown): value is ImageModelKey {
  return typeof value === 'string' && value in IMAGE_MODEL_REGISTRY;
}

export function resolveImageModel(key: string): ImageModelRegistryEntry {
  return IMAGE_MODEL_REGISTRY[isImageModelKey(key) ? key : DEFAULT_IMAGE_MODEL];
}
