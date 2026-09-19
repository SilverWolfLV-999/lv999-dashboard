'use client';

import type { UIMessage } from 'ai';
import { isToolUIPart } from 'ai';
import { memo } from 'react';
import { Streamdown } from 'streamdown';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Message, MessageContent } from '@/components/ui/message';
import { ToolArtifactPart, type CreateArtifactToolPart } from './tool-artifact-part';

/**
 * 消息项：memo 化（props 仅 message）。
 * AI SDK 的 replaceMessage 只替换目标消息对象、其余消息引用不变，
 * 因此流式 chunk 与输入变化时，历史消息可真实跳过重渲染（Streamdown 解析成本高）。
 */
export const MessageItem = memo(function MessageItem({ message }: { message: UIMessage }) {
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
              <ToolArtifactPart key={index} part={part as unknown as CreateArtifactToolPart} />
            );
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
});
