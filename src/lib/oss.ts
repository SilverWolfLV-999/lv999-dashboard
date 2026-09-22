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

/**
 * 视频截帧封面签名 URL（OSS 原生视频截帧，零成本零依赖零存储）。
 *
 * 通过 signatureUrl 的 process 选项下发 `x-oss-process=video/snapshot`，该参数会被纳入签名
 * （私有桶必需；不能先签名再手动拼接 &x-oss-process，否则 SignatureDoesNotMatch）。
 * 返回的是同步签名字符串（signatureUrl 为同步 API）。
 *
 * 参数默认值（列表缩略图）：第 1 秒截帧、jpg、宽 400px、fast 关键帧模式。
 */
export function videoSnapshotUrl(
  storageKey: string,
  options?: {
    /** 截帧时间（毫秒），默认 1000（第 1 秒，避开黑屏开场） */
    time?: number;
    /** 输出宽度（高度自动按比例），默认 400 */
    width?: number;
    /** 输出格式，默认 jpg */
    format?: 'jpg' | 'png';
    /** 截帧模式，默认 fast（关键帧，更快） */
    mode?: 'fast' | 'accurate';
    /** 签名有效期（秒），默认 3600 */
    expiresInSeconds?: number;
  }
): string {
  const time = options?.time ?? 1000;
  const width = options?.width ?? 400;
  const format = options?.format ?? 'jpg';
  const mode = options?.mode ?? 'fast';
  const expiresInSeconds = options?.expiresInSeconds ?? 3600;
  return getOssClient().signatureUrl(storageKey, {
    expires: expiresInSeconds,
    process: `video/snapshot,t_${time},f_${format},w_${width},m_${mode}`
  });
}
