'use client';

import type { UIMessage } from 'ai';
import { isToolUIPart } from 'ai';
import { memo } from 'react';
import { Streamdown } from 'streamdown';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Message, MessageContent } from '@/components/ui/message';
import { ToolArtifactPart, type CreateArtifactToolPart } from './tool-artifact-part';
import { ToolImagePart, type CreateImageArtifactToolPart } from './tool-image-part';

/**
 * 消息项：memo 化（props 仅 message / isActive）。
 * AI SDK 的 replaceMessage 只替换目标消息对象、其余消息引用不变，
 * 因此流式 chunk 与输入变化时，历史消息可真实跳过重渲染（Streamdown 解析成本高）。
 *
 * isActive：该消息是否为当前正在流式的最后一条 assistant 消息。
 * AI SDK 中止语义下进行中的 tool part 不会被置为终态（流以 abort 结束），
 * 因此只有 active 消息中的进行中 tool part 渲染为 loading，其余视为已停止收尾。
 */
export const MessageItem = memo(function MessageItem({
  message,
  isActive = false
}: {
  message: UIMessage;
  isActive?: boolean;
}) {
  if (message.role === 'user') {
    return (
      <Message align='end'>
        <MessageContent>
          {message.parts.map((part, index) =>
            part.type === 'text' ? (
              <Bubble key={index} variant='secondary' align='end'>
                <BubbleContent className='whitespace-pre-wrap'>{part.text}</BubbleContent>
              </Bubble>
            ) : null
          )}
        </MessageContent>
      </Message>
    );
  }

  return (
    <Message align='start'>
      <MessageContent>
        {message.parts.map((part, index) => {
          if (part.type === 'text') {
            if (!part.text) return null;
            return (
              <div key={index} className='w-full'>
                <Streamdown>{part.text}</Streamdown>
              </div>
            );
          }
          if (isToolUIPart(part) && part.type === 'tool-createArtifact') {
            return (
              <ToolArtifactPart
                key={index}
                part={part as unknown as CreateArtifactToolPart}
                active={isActive}
              />
            );
          }
          if (isToolUIPart(part) && part.type === 'tool-createImageArtifact') {
            return (
              <ToolImagePart
                key={index}
                part={part as unknown as CreateImageArtifactToolPart}
                active={isActive}
              />
            );
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
});
