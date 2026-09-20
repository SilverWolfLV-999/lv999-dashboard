import { ToolLoopAgent, isStepCount, tool, type InferUITools, type UIMessage } from 'ai';
import { z } from 'zod';
import { DEFAULT_MODEL, isModelKey } from '../constants/models';
import { ASPECT_KEYS, ASPECT_PRESETS } from '../constants/image-models';
import { resolveModel } from './provider';
import { generateImage } from './image-generation';
import { editImageAssetCore } from './image-edit';
import { createAsset, createImageAsset } from './service';
import type { AssetKind } from './types';

/** 单个资产的内容上限（字符数按 UTF-8 字节计算） */
export const MAX_ASSET_SIZE_BYTES = 200 * 1024;

const AGENT_INSTRUCTIONS = `你是「Agent 创作工作台」的编排 Agent，帮助用户产出高质量的内容作品。

工作方式：
1. 先用 1-3 句话说明你的创作计划，然后开始执行。
2. 当产出的内容构成完整作品（文案、文章、报告、网页等）时，必须调用 createAsset 工具把作品保存为资产：
   - Markdown 文章/文案 → kind 用 "markdown"
   - 完整 HTML 网页 → kind 用 "html"（必须是可直接打开运行的完整文档，样式与脚本内联，不依赖本地文件）
3. 当用户需要配图、封面、海报、插画等图片时，调用 createImageAsset 工具生成图片资产：
   - prompt 必须自包含：用中文详细描述主体、风格、构图、色调与氛围，不依赖对话上下文
   - 画面中需要出现文字时（如封面标题），在 prompt 中写明文字内容与位置
   - 需要竖版封面（小红书等）时用 aspect 指定 "3:4"；方形用 "1:1"、横版用 "16:9"；不确定时可不传
   - 图片生成通常需要 10-60 秒，等待期间不要重复调用；同时可继续撰写配套文案
4. 当用户要求修改、迭代已有图片（如"把刚才那张改成水墨风""背景换成夜晚"）时，调用 editImageAsset：
   - sourceAssetId 必须来自上文工具返回值：使用 createImageAsset / editImageAsset 返回的 assetId
   - instruction 描述修改要求；title 反映修改后的结果（如"杭州秋日漫步·水墨风"）
   - 一次编辑只基于一张源图；用户想改的图无法从上文确定时，先问清楚再调用
5. 一次回复可以产出多个资产（例如"三版文案"= 三个 markdown 资产；或先配图再写文案；或先 markdown 文案再配套 HTML 落地页）。
6. 保存完成后，用一两句话总结产出了什么，不要重复粘贴完整内容。
7. 默认使用中文；遵循用户指定的语气、风格与篇幅要求。
8. 不要编造需要实时数据支持的事实；不确定时明确说明。`;

const CREATE_ASSET_DESCRIPTION =
  '把一份完整作品保存为结构化资产。Markdown 文章/文案用 kind=markdown；完整 HTML 网页用 kind=html（必须是可以直接打开运行的完整文档，样式与脚本内联）。';

const createAssetInputSchema = z.object({
  title: z.string().min(1).max(100).describe('资产标题'),
  kind: z.enum(['markdown', 'html']).describe('资产类型'),
  content: z.string().min(1).describe('资产完整内容')
});

const aspectFieldSchema = z
  .enum(ASPECT_KEYS)
  .optional()
  .describe(
    '可选：输出比例。竖版小红书封面用 "3:4"，方形 "1:1"，横版 "16:9" 等；不传由模型自动推荐分辨率'
  );

const CREATE_IMAGE_ASSET_DESCRIPTION =
  '用文生图模型生成一张图片并保存为图片资产。适合封面、海报、配图、插画等场景。prompt 必须完整自包含地描述画面（主体、风格、构图、色调、氛围），不依赖对话上下文；画面中需要出现文字（如标题）时，在 prompt 中写明文字内容与位置；需要竖版（如小红书封面）时用 aspect 指定 "3:4"。';

const createImageAssetInputSchema = z.object({
  title: z.string().min(1).max(100).describe('资产标题'),
  prompt: z.string().min(1).max(2000).describe('文生图提示词：完整自包含的画面描述（中文优先）'),
  aspect: aspectFieldSchema
});

const EDIT_IMAGE_ASSET_DESCRIPTION =
  '在已有图片资产的基础上按用户要求进行图像编辑（图生图），产出新的图片资产。sourceAssetId 必须使用上文中 createImageAsset / editImageAsset 工具返回的 assetId；instruction 描述修改要求（如"背景换成夜晚""改成水墨淡彩风格"）；title 反映修改后的结果。';

const editImageAssetInputSchema = z.object({
  sourceAssetId: z
    .string()
    .uuid()
    .describe('被修改的源图片资产 id（必须来自上文 createImageAsset / editImageAsset 的返回值）'),
  title: z.string().min(1).max(100).describe('修改后新资产的标题'),
  instruction: z
    .string()
    .min(1)
    .max(2000)
    .describe('修改指令：描述如何修改这张图（如"背景换成夜晚""改成水墨淡彩风格"）'),
  aspect: z
    .enum(ASPECT_KEYS)
    .optional()
    .describe('可选：改变输出比例（不传则延续源图构图；需要竖版封面用 "3:4"）')
});

/** 服务端校验历史消息使用（无需 execute，与 Agent 内工具共享同一 schema） */
export const agentValidationTools = {
  createAsset: tool({
    description: CREATE_ASSET_DESCRIPTION,
    inputSchema: createAssetInputSchema
  }),
  createImageAsset: tool({
    description: CREATE_IMAGE_ASSET_DESCRIPTION,
    inputSchema: createImageAssetInputSchema
  }),
  editImageAsset: tool({
    description: EDIT_IMAGE_ASSET_DESCRIPTION,
    inputSchema: editImageAssetInputSchema
  })
};

/** 与 agentValidationTools 对齐的 UI 消息类型（供 validateUIMessages 泛型推导 tools 校验类型） */
export type AgentValidationUIMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof agentValidationTools>
>;

function createAssetTool(params: { userId: string; conversationId: string }) {
  return tool({
    description: CREATE_ASSET_DESCRIPTION,
    inputSchema: createAssetInputSchema,
    execute: async ({ title, kind, content }) => {
      const sizeBytes = Buffer.byteLength(content, 'utf8');
      if (sizeBytes > MAX_ASSET_SIZE_BYTES) {
        throw new Error(
          `资产内容超过上限（${Math.round(MAX_ASSET_SIZE_BYTES / 1024)}KB），请精简后重试。`
        );
      }
      const asset = await createAsset({
        userId: params.userId,
        conversationId: params.conversationId,
        title,
        kind: kind as AssetKind,
        content
      });
      return { assetId: asset.id, title, kind, sizeBytes: asset.sizeBytes };
    }
  });
}

function createImageAssetTool(params: { userId: string; conversationId: string }) {
  return tool({
    description: CREATE_IMAGE_ASSET_DESCRIPTION,
    inputSchema: createImageAssetInputSchema,
    execute: async ({ title, prompt, aspect }, { abortSignal }) => {
      // 「调用 → 拿临时 URL → 立即下载」在 generateImage 内完成（临时 URL 不外泄）；
      // abortSignal 透传：停止时同步取消进行中的请求与轮询（已创建的百炼任务会自然完成，无副作用）
      const size = aspect ? ASPECT_PRESETS[aspect] : undefined;
      const { imageBuffer, mime } = await generateImage({ prompt, size, signal: abortSignal });
      const asset = await createImageAsset({
        userId: params.userId,
        conversationId: params.conversationId,
        title,
        prompt,
        imageBuffer,
        mime
      });
      // 返回结构与 createAsset 对齐，复用对话内资产卡片渲染
      return { assetId: asset.id, title, kind: 'image' as const, sizeBytes: asset.sizeBytes };
    }
  });
}

export function editImageAssetTool(params: { userId: string; conversationId: string }) {
  return tool({
    description: EDIT_IMAGE_ASSET_DESCRIPTION,
    inputSchema: editImageAssetInputSchema,
    execute: async ({ sourceAssetId, title, instruction, aspect }, { abortSignal }) => {
      // 核心流程（预检 → 签名 URL → I2I → 落库血缘）抽至 image-edit.ts，与直连端点复用；
      // abortSignal 透传：停止时同步取消进行中的请求（已创建的百炼任务会自然完成，无副作用）
      const asset = await editImageAssetCore({
        userId: params.userId,
        sourceAssetId,
        instruction,
        aspect,
        title,
        conversationId: params.conversationId,
        signal: abortSignal
      });
      // 返回结构与 createImageAsset 对齐，复用对话内资产卡片渲染；sourceAssetId 供后续继续迭代追溯
      return {
        assetId: asset.id,
        title: asset.title,
        kind: 'image' as const,
        sizeBytes: asset.sizeBytes,
        sourceAssetId
      };
    }
  });
}

/**
 * 每请求构建一个 Agent（serverless 无状态，上下文经闭包注入工具）。
 */
export function buildAgent(params: { userId: string; conversationId: string; modelKey: string }) {
  const modelKey = isModelKey(params.modelKey) ? params.modelKey : DEFAULT_MODEL;
  return new ToolLoopAgent({
    model: resolveModel(modelKey),
    instructions: AGENT_INSTRUCTIONS,
    tools: {
      createAsset: createAssetTool(params),
      createImageAsset: createImageAssetTool(params),
      editImageAsset: editImageAssetTool(params)
    },
    stopWhen: isStepCount(6),
    timeout: { totalMs: 240_000 },
    // 生命周期回调（官方推荐 onStepEnd/onEnd）：记录 step/usage/工具调用，为限额、计费与排障提供数据
    onStepEnd: ({ stepNumber, finishReason, toolCalls, usage }) => {
      console.warn('[agent] step finished', {
        stepNumber,
        finishReason,
        toolCalls: toolCalls?.map((toolCall) => toolCall.toolName) ?? [],
        totalTokens: usage.totalTokens
      });
    },
    onEnd: ({ usage, steps }) => {
      console.warn('[agent] run finished', {
        totalSteps: steps.length,
        totalTokens: usage.totalTokens
      });
    }
  });
}
