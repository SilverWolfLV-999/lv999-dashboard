import OSS from 'ali-oss';

/**
 * 阿里云 OSS 封装（Phase 0 基建）。
 *
 * Phase 1 的文本资产内容存 Postgres（阿里云 RDS）；Phase 2 起图片/视频等二进制资产使用本模块：
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

/** 资产对象的存储路径约定（服务端写入路径；路径约定的变更需同步清理旧前缀对象） */
export function assetObjectKey(userId: string, assetId: string, extension: string): string {
  return `assets/${userId}/${assetId}.${extension}`;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getOssClient().put(key, body, {
    headers: { 'Content-Type': contentType }
  });
}

/**
 * 生成带签名的临时访问 URL（私有 bucket 读取）。
 * response 覆盖参数可控制 OSS 返回的响应头（如附件下载文件名）。
 * 注意：OSS 不允许覆盖 content-type（response-content-type 会报 400
 * "Can not override response header on content-type"），对象上传时已固化 Content-Type。
 */
export async function getSignedUrl(
  key: string,
  expiresInSeconds = 3600,
  response?: { contentDisposition?: string }
): Promise<string> {
  return getOssClient().signatureUrl(key, {
    expires: expiresInSeconds,
    ...(response?.contentDisposition && {
      response: { 'content-disposition': response.contentDisposition }
    })
  });
}
