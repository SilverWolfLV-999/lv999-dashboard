/* oxlint-disable no-console */
/**
 * OSS 冒烟脚本：上传一个测试对象并生成签名 URL，验证 OSS 配置与网络连通。
 *
 * 运行：bun run scripts/oss-smoke.ts
 * 前置：.env.local 中配置 OSS_REGION / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
 */
import { artifactObjectKey, getSignedUrl, putObject } from '../src/lib/oss';

const key = artifactObjectKey('smoke-test', `oss-smoke-${Date.now()}`, 'txt');

await putObject(
  key,
  Buffer.from('lv999-dashboard OSS smoke test', 'utf8'),
  'text/plain; charset=utf-8'
);
const url = await getSignedUrl(key, 300);

console.log(`[ok] 上传成功：${key}`);
console.log(`[ok] 签名 URL（5 分钟有效）: ${url}`);
