import { ToolLoopAgent, isStepCount, tool, type InferUITools, type UIMessage } from 'ai';
import { z } from 'zod';
import { DEFAULT_MODEL, isModelKey } from '../constants/models';
import { getSkill } from '../constants/skills';
import { ASPECT_KEYS, ASPECT_PRESETS } from '../constants/image-models';
import { resolveModel } from './provider';
import { generateImage } from './image-generation';
import { editImageAssetCore } from './image-edit';
import { createAsset, createImageAsset, getAsset, searchAssets } from './service';
import { ASSET_KIND_VALUES } from './types';
import { searchKnowledgeByText } from '@/features/knowledge/lib/search';
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
   - sourceAssetId 必须是真实存在的图片资产 id：来自上文 createImageAsset / editImageAsset 的返回值、findAssets 的检索结果，或用户消息中的 [引用资产] 块
   - instruction 描述修改要求；title 反映修改后的结果（如"杭州秋日漫步·水墨风"）
   - 一次编辑只基于一张源图；用户想改的图无法从上文确定时，先问清楚再调用
5. 复用用户已有作品（findAssets / readAsset）：
   - 用户消息中出现 [引用资产] 块时，直接使用块内给出的 id，不要再调 findAssets 检索
   - 用户用自然语言指向已有作品（"我之前那张秋天的图""基于这篇文案再写一版"）时，先用 findAssets 检索确认，绝不臆造 id 或内容
   - 命中多个候选时，列出候选请用户确认，或选最相关的一个并说明依据；findAssets 无命中时如实告知并请用户补充线索
   - 基于文本资产（markdown / html）改写或扩展 → 先 readAsset 取正文，再创作并用 createAsset 存为新资产（不要覆盖原资产）
   - 修改图片资产 → 用 editImageAsset（sourceAssetId 传该图 id），不要试图用 readAsset 的提示词去"重画"一张
6. 知识库（knowledgeSearch，按内容语义检索用户沉淀的资料）：
   - 用户说"我知识库里…""根据我的资料/笔记""基于我沉淀的文档写一版"，或问题必须引用用户自有资料才能作答时，先调 knowledgeSearch（可多次、用不同角度的 query）
   - 只依据返回的片段作答或创作，并说明引用了哪些文档（用 documentTitle 标注来源）
   - 无命中时如实告知"知识库中未找到相关资料"，绝不编造；可追问用户是否补充资料
   - 与 findAssets 的区别：findAssets 按标题关键词找「作品」（用于复用/改写）；knowledgeSearch 按语义找「资料」（用于问答/综述）
7. 一次回复可以产出多个资产（例如"三版文案"= 三个 markdown 资产；或先配图再写文案；或先 markdown 文案再配套 HTML 落地页）。
8. 保存完成后，用一两句话总结产出了什么，不要重复粘贴完整内容。
9. 默认使用中文；遵循用户指定的语气、风格与篇幅要求。
10. 不要编造需要实时数据支持的事实；不确定时明确说明。`;

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
  '在已有图片资产的基础上按用户要求进行图像编辑（图生图），产出新的图片资产。sourceAssetId 必须是真实存在的图片资产 id：来自上文 createImageAsset / editImageAsset 的返回值、findAssets 的检索结果，或用户消息中 [引用资产] 块给出的 id；instruction 描述修改要求（如"背景换成夜晚""改成水墨淡彩风格"）；title 反映修改后的结果。';

const editImageAssetInputSchema = z.object({
  sourceAssetId: z
    .string()
    .uuid()
    .describe(
      '被修改的源图片资产 id（来自上文 createImageAsset / editImageAsset 返回值、findAssets 结果或消息中的 [引用资产] 块）'
    ),
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

const FIND_ASSETS_DESCRIPTION =
  '检索当前用户的资产库（「我的资产」），按标题关键词与类型查找可复用的已有作品，返回候选的元信息（assetId / title / kind / createdAt），不返回正文与图片。当用户提到"我之前那张""这篇文案""上次的封面"等指向已有作品时，先用它确认 assetId：文本资产接着用 readAsset 取正文，图片资产接着用 editImageAsset 修改。消息中已有 [引用资产] 块时不需要调用本工具。';

const findAssetsInputSchema = z.object({
  query: z
    .string()
    .max(100)
    .optional()
    .describe('标题关键词（模糊匹配），如"秋天""开学文案"；不确定时可省略以列出最近资产'),
  kind: z
    .enum(ASSET_KIND_VALUES)
    .optional()
    .describe('限定资产类型：markdown / html / image / design；不确定时可省略'),
  limit: z.number().int().min(1).max(20).optional().describe('返回条数上限，默认 8')
});

const READ_ASSET_DESCRIPTION =
  '读取指定资产的可用内容，用于"基于它再创作"（改写、扩展、总结、写配套文案等）。markdown / html 返回正文 content；image 返回其生成提示词 prompt（不返回图片本身，要改图请用 editImageAsset）；design 为结构化数据，不支持读取正文。assetId 必须来自 findAssets 结果、上文工具返回值或消息中的 [引用资产] 块。';

const readAssetInputSchema = z.object({
  assetId: z.string().uuid().describe('要读取的资产 id（必须归属当前用户）')
});

const KNOWLEDGE_SEARCH_DESCRIPTION =
  '在用户的知识库（RAG）中按内容语义检索资料片段，返回 results: [{ documentId, documentTitle, chunkIndex, content, score }]（score 为相似度，越大越相关）。当用户说"我知识库里…""根据我的资料/笔记""基于我沉淀的文档写一版"，或问题需要引用用户自有资料才能作答时使用。只依据返回片段作答并用 documentTitle 标注来源；results 为空表示知识库中没有相关资料，应如实告知。与 findAssets 的区别：findAssets 按标题关键词找"作品"（用于复用/改写），knowledgeSearch 按语义找"资料"（用于问答/综述）。';

const knowledgeSearchInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe('检索问句：用自然语言描述要找的内容（包含关键概念词效果更好）'),
  topK: z.number().int().min(1).max(8).optional().describe('返回片段数上限，默认 5')
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
  }),
  findAssets: tool({
    description: FIND_ASSETS_DESCRIPTION,
    inputSchema: findAssetsInputSchema
  }),
  readAsset: tool({
    description: READ_ASSET_DESCRIPTION,
    inputSchema: readAssetInputSchema
  }),
  knowledgeSearch: tool({
    description: KNOWLEDGE_SEARCH_DESCRIPTION,
    inputSchema: knowledgeSearchInputSchema
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
 * 资产库检索工具：只读元信息，按 userId 过滤（归属校验在 searchAssets 内完成）。
 * 不回传 content / storageKey / 签名 URL：避免工具输出膨胀，也避免图片地址流入模型上下文。
 */
function findAssetsTool(params: { userId: string }) {
  return tool({
    description: FIND_ASSETS_DESCRIPTION,
    inputSchema: findAssetsInputSchema,
    execute: async ({ query, kind, limit }) => {
      const hits = await searchAssets(params.userId, { query, kind, limit });
      return { assets: hits };
    }
  });
}

/**
 * 资产正文读取工具：按 kind 分支返回可用内容。
 * 图片只回传生成提示词（像素不进上下文，改图走 editImageAsset 服务端传参）；
 * 归属校验复用 getAsset（越权与不存在同样返回 undefined，不泄漏存在性）。
 */
function readAssetTool(params: { userId: string }) {
  return tool({
    description: READ_ASSET_DESCRIPTION,
    inputSchema: readAssetInputSchema,
    execute: async ({ assetId }) => {
      const asset = await getAsset(params.userId, assetId);
      if (!asset) {
        throw new Error('找不到该资产（可能已删除或不属于当前用户），请用 findAssets 重新检索。');
      }
      if (asset.kind === 'markdown' || asset.kind === 'html') {
        return {
          kind: asset.kind,
          title: asset.title,
          content: asset.content ?? '',
          hint: '这是文本资产正文；请基于它按用户要求改写/扩展，并用 createAsset 保存为新资产。'
        };
      }
      if (asset.kind === 'image') {
        return {
          kind: asset.kind,
          title: asset.title,
          prompt: asset.content ?? '',
          hint: `这是图片资产（prompt 为其生成提示词）；若要在其基础上修改，请调用 editImageAsset 并把 ${assetId} 作为 sourceAssetId。`
        };
      }
      return {
        kind: asset.kind,
        title: asset.title,
        hint: '设计文档为结构化数据，暂不支持读取正文。'
      };
    }
  });
}

/**
 * 知识库语义检索工具：embed(query) → pgvector cosine topK（均在 knowledge 服务层完成）。
 * 只回传命中片段与来源标题（不回传向量）；低相关片段已按阈值过滤，
 * 空结果时额外给出"如实告知"提示，降低模型臆造概率。
 */
function knowledgeSearchTool(params: { userId: string }) {
  return tool({
    description: KNOWLEDGE_SEARCH_DESCRIPTION,
    inputSchema: knowledgeSearchInputSchema,
    execute: async ({ query, topK }) => {
      const results = await searchKnowledgeByText(params.userId, query, topK);
      return {
        results,
        hint:
          results.length === 0
            ? '知识库中未找到相关资料：请如实告知用户，不要编造内容。'
            : '请只依据以上片段作答或创作，并用 documentTitle 说明引用了哪些文档。'
      };
    }
  });
}

/**
 * 每请求构建一个 Agent（serverless 无状态，上下文经闭包注入工具）。
 * skillId：会话级技能（专家模式）；命中注册表时把技能指令追加到基础指令后。
 * 防御：未知/已下架 id（getSkill → undefined）回退基础指令，不报错。
 */
export function buildAgent(params: {
  userId: string;
  conversationId: string;
  modelKey: string;
  skillId?: string | null;
}) {
  const modelKey = isModelKey(params.modelKey) ? params.modelKey : DEFAULT_MODEL;
  const skill = getSkill(params.skillId);
  const instructions = skill
    ? `${AGENT_INSTRUCTIONS}\n\n# 当前技能：${skill.name}\n${skill.instructions}`
    : AGENT_INSTRUCTIONS;
  return new ToolLoopAgent({
    model: resolveModel(modelKey),
    instructions,
    tools: {
      createAsset: createAssetTool(params),
      createImageAsset: createImageAssetTool(params),
      editImageAsset: editImageAssetTool(params),
      findAssets: findAssetsTool(params),
      readAsset: readAssetTool(params),
      knowledgeSearch: knowledgeSearchTool(params)
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
