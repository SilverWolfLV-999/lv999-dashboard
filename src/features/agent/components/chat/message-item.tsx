'use client';

import type { UIMessage } from 'ai';
import { isToolUIPart } from 'ai';
import { Streamdown } from 'streamdown';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import { Message, MessageContent } from '@/components/ui/message';
import { ToolArtifactPart } from './tool-artifact-part';

export function MessageItem({ message }: { message: UIMessage }) {
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
                part={part as unknown as { state: string; input?: { title?: string } }}
              />
            );
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
}
