import OSS from 'ali-oss';

/**
 * 阿里云 OSS 封装（Phase 0 基建）。
 *
 * Phase 1 的文本产物内容存 Neon；Phase 2 起图片/视频等二进制产物使用本模块：
 * 上传到 OSS，数据库仅存 storage_key，读取时用签名 URL 直连 OSS。
 */

let client: OSS | undefined;

export function getOssClient(): OSS {
  if (!client) {
    const { OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET } = process.env;
    if (!OSS_REGION || !OSS_BUCKET || !OSS_ACCESS_KEY_ID || !OSS_ACCESS_KEY_SECRET) {
      throw new Error(
        'Aliyun OSS is not configured. Set OSS_REGION / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET in .env.local.'
      );
    }
    client = new OSS({
      region: OSS_REGION,
      bucket: OSS_BUCKET,
      accessKeyId: OSS_ACCESS_KEY_ID,
      accessKeySecret: OSS_ACCESS_KEY_SECRET
    });
  }
  return client;
}

/** 产物对象的存储路径约定 */
export function artifactObjectKey(userId: string, artifactId: string, extension: string): string {
  return `artifacts/${userId}/${artifactId}.${extension}`;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getOssClient().put(key, body, {
    headers: { 'Content-Type': contentType }
  });
}

/** 生成带签名的临时访问 URL（私有 bucket 读取） */
export async function getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  return getOssClient().signatureUrl(key, { expires: expiresInSeconds });
}
