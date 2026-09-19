/* oxlint-disable no-console */
/**
 * resumable-stream + Redis 冒烟脚本：
 * 验证 Upstash 连接、pub/sub、以及"读者离开后生产者继续、可通过 resume 重连并回放"的完整链路。
 *
 * 运行：bun run scripts/resumable-smoke.ts
 * 前置：.env.local 中配置 REDIS_URL（TLS 连接串）
 */
import { createResumableStreamContext } from 'resumable-stream';

// CLI 脚本无 serverless 挂起问题，waitUntil 传 null
const streamContext = createResumableStreamContext({ waitUntil: null });

function makeSlowStream(): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      controller.enqueue('part-1|');
      await new Promise((resolve) => setTimeout(resolve, 400));
      controller.enqueue('part-2');
      controller.close();
    }
  });
}

// 1) 基础链路：创建流并读完整
const simpleId = `smoke-${Date.now()}`;
const simple = await streamContext.createNewResumableStream(
  simpleId,
  () =>
    new ReadableStream<string>({
      start(controller) {
        controller.enqueue('hello-');
        controller.enqueue('world');
        controller.close();
      }
    })
);
if (!simple) {
  console.error('[fail] createNewResumableStream 返回 null');
  process.exit(1);
}
let simpleText = '';
const simpleReader = simple.getReader();
while (true) {
  const { done, value } = await simpleReader.read();
  if (done) break;
  simpleText += value;
}
console.log(`[ok] 基础流读取完成：${simpleText}`);

// 2) 恢复链路：读者提前离开（cancel），生产者继续写完整，resume 重连并回放
const resumeId = `smoke-resume-${Date.now()}`;
const slow = await streamContext.createNewResumableStream(resumeId, makeSlowStream);
if (!slow) {
  console.error('[fail] 创建恢复测试流失败');
  process.exit(1);
}
const reader = slow.getReader();
const first = await reader.read();
console.log(`[ok] 第一段读取：${first.value}`);
await reader.cancel(); // 模拟客户端断开

const resumed = await streamContext.resumeExistingStream(resumeId);
if (!resumed) {
  console.error('[fail] resumeExistingStream 未返回流（生产者可能已结束，存在时序波动）');
  process.exit(1);
}
let replayed = '';
const resumedReader = resumed.getReader();
while (true) {
  const { done, value } = await resumedReader.read();
  if (done) break;
  replayed += value;
}
console.log(`[ok] 恢复流读取完成（含回放）：${replayed}`);

console.log('\nUpstash Redis + resumable-stream 链路验证通过。');
process.exit(0);
