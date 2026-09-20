import { auth } from '@clerk/nextjs/server';
import { notFound } from 'next/navigation';
import { getAsset } from '@/features/agent/api/service';
import { DesignEditorIsland } from '@/features/design/components/design-editor-island';
import { createEmptyDocument } from '@/features/design/constants/canvas';
import { parseDesignDocument } from '@/features/design/lib/document';
import { isUuid } from '@/lib/utils';

export const metadata = {
  title: 'Dashboard: 设计画布'
};

type PageProps = {
  params: Promise<{ id: string }>;
};

/** 打开已存 design：归属 + 类型校验，把文档作为初始状态传入客户端编辑器 */
export default async function DesignEditPage({ params }: PageProps) {
  const { userId } = await auth();
  if (!userId) notFound();

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const asset = await getAsset(userId, id);
  if (!asset || asset.kind !== 'design') notFound();

  // 文档损坏/版本不符时回退空白文档（不阻断编辑；用户可重新保存覆盖）
  const initialDocument = parseDesignDocument(asset.content) ?? createEmptyDocument();

  return (
    <DesignEditorIsland
      key={asset.id}
      assetId={asset.id}
      initialTitle={asset.title}
      initialDocument={initialDocument}
    />
  );
}
