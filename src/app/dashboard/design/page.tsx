import { DesignEditorIsland } from '@/features/design/components/design-editor-island';
import { createEmptyDocument } from '@/features/design/constants/canvas';

export const metadata = {
  title: 'Dashboard: 设计画布'
};

/** 新建设计：渲染空白画布；首次保存时创建 design 资产并跳转到 /dashboard/design/[id] */
export default function DesignNewPage() {
  return (
    <DesignEditorIsland
      assetId={null}
      initialTitle='未命名设计'
      initialDocument={createEmptyDocument()}
    />
  );
}
