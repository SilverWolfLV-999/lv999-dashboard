import { ToolLoopAgent, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { DEFAULT_MODEL, isModelKey } from '../constants/models';
import { resolveModel } from './provider';
import { createArtifact } from './service';
import type { ArtifactKind } from './types';

/** 单个产物的内容上限（字符数按 UTF-8 字节计算） */
export const MAX_ARTIFACT_SIZE_BYTES = 200 * 1024;

const AGENT_INSTRUCTIONS = `你是「Agent 创作工作台」的编排 Agent，帮助用户产出高质量的内容作品。

工作方式：
1. 先用 1-3 句话说明你的创作计划，然后开始执行。
2. 当产出的内容构成完整作品（文案、文章、报告、网页等）时，必须调用 createArtifact 工具把作品保存为产物：
   - Markdown 文章/文案 → kind 用 "markdown"
   - 完整 HTML 网页 → kind 用 "html"（必须是可直接打开运行的完整文档，样式与脚本内联，不依赖本地文件）
3. 一次回复可以产出多个产物（例如"三版文案"= 三个 markdown 产物；或先 markdown 文案再配套 HTML 落地页）。
4. 保存完成后，用一两句话总结产出了什么，不要重复粘贴完整内容。
5. 默认使用中文；遵循用户指定的语气、风格与篇幅要求。
6. 不要编造需要实时数据支持的事实；不确定时明确说明。`;

function createArtifactTool(params: { userId: string; conversationId: string }) {
  return tool({
    description:
      '把一份完整作品保存为结构化产物。Markdown 文章/文案用 kind=markdown；完整 HTML 网页用 kind=html（必须是可以直接打开运行的完整文档，样式与脚本内联）。',
    inputSchema: z.object({
      title: z.string().min(1).max(100).describe('产物标题'),
      kind: z.enum(['markdown', 'html']).describe('产物类型'),
      content: z.string().min(1).describe('产物完整内容')
    }),
    execute: async ({ title, kind, content }) => {
      const sizeBytes = Buffer.byteLength(content, 'utf8');
      if (sizeBytes > MAX_ARTIFACT_SIZE_BYTES) {
        throw new Error(
          `产物内容超过上限（${Math.round(MAX_ARTIFACT_SIZE_BYTES / 1024)}KB），请精简后重试。`
        );
      }
      const artifact = await createArtifact({
        userId: params.userId,
        conversationId: params.conversationId,
        title,
        kind: kind as ArtifactKind,
        content
      });
      return { artifactId: artifact.id, title, kind, sizeBytes: artifact.sizeBytes };
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
      createArtifact: createArtifactTool(params)
    },
    stopWhen: isStepCount(6),
    timeout: { totalMs: 240_000 }
  });
}
