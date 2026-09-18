/**
 * 模型注册表 —— UI 与数据库使用内部 key，provider model ID 是映射细节。
 *
 * 百炼（阿里云百炼 Model Studio）model ID 以控制台实际列表为准；
 * 若某个模型不被官方 provider 包支持，可将 transport 改为 'compatible'
 * 走百炼 OpenAI 兼容模式（同一 API Key）。
 */

export type ModelKey = 'deepseek-flash' | 'deepseek-v4-pro' | 'qwen3.8-flash' | 'qwen3.8-max';

export type ModelTransport = 'alibaba' | 'compatible';

export interface ModelRegistryEntry {
  label: string;
  description: string;
  providerModelId: string;
  transport: ModelTransport;
  capabilities: {
    multimodal?: boolean;
    thinking?: boolean;
  };
}

export const DEFAULT_MODEL: ModelKey = 'deepseek-flash';

export const MODEL_REGISTRY: Record<ModelKey, ModelRegistryEntry> = {
  'deepseek-flash': {
    label: 'DeepSeek V4.1 Flash',
    description: '默认模型：速度快、成本低，原生多模态（官方滚动别名 deepseek-flash）',
    providerModelId: 'deepseek-v4.1-flash',
    transport: 'alibaba',
    capabilities: { multimodal: true, thinking: true }
  },
  'deepseek-v4-pro': {
    label: 'DeepSeek V4 Pro',
    description: '更强旗舰，适合复杂长文创作（官方处于过渡期，可能被 V4.1 系替代）',
    providerModelId: 'deepseek-v4-pro-0813',
    transport: 'alibaba',
    capabilities: { thinking: true }
  },
  'qwen3.8-flash': {
    label: 'Qwen3.8 Flash',
    description: '通义千问快速版：多模态、百万级上下文',
    providerModelId: 'qwen3.8-flash',
    transport: 'alibaba',
    capabilities: { multimodal: true, thinking: true }
  },
  'qwen3.8-max': {
    label: 'Qwen3.8 Max',
    description: '通义千问旗舰：2.4T MoE，综合能力最强',
    providerModelId: 'qwen3.8-max',
    transport: 'alibaba',
    capabilities: { multimodal: true, thinking: true }
  }
};

export const MODEL_KEYS = Object.keys(MODEL_REGISTRY) as ModelKey[];

export function isModelKey(value: unknown): value is ModelKey {
  return typeof value === 'string' && value in MODEL_REGISTRY;
}

export function getModelLabel(key: string): string {
  return isModelKey(key) ? MODEL_REGISTRY[key].label : key;
}
