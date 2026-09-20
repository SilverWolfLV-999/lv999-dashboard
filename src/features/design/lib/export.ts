import type Konva from 'konva';
import type { DesignDocument } from '../api/types';

/**
 * 画布导出（Konva 官方「高质量导出」纪律）：
 * - 导出前隐藏所有 Transformer（选择手柄不入图）；
 * - 临时把相机（缩放/平移）归一并将 Stage 尺寸设为文档尺寸，使导出区域恰为整幅文档，
 *   不受当前视图缩放/平移影响；同步执行、finally 恢复，用户看不到闪烁；
 * - pixelRatio 归一：按最长边上限折算，产出稳定尺寸且避免超出浏览器 canvas 上限。
 *
 * 图片对象经同源 /raw 代理加载，画布未被跨域污染，toDataURL 正常。
 */

export interface ExportOptions {
  /** 输出最长边像素上限（控制体积/清晰度） */
  maxDimension?: number;
  /** pixelRatio 上限 */
  maxPixelRatio?: number;
}

export function exportStageToDataURL(
  stage: Konva.Stage,
  doc: DesignDocument,
  options: ExportOptions = {}
): string {
  const maxDimension = options.maxDimension ?? 2560;
  const maxPixelRatio = options.maxPixelRatio ?? 2;
  const longestSide = Math.max(doc.width, doc.height, 1);
  const pixelRatio = Math.max(0.1, Math.min(maxPixelRatio, maxDimension / longestSide));

  const transformers = stage.find('Transformer');
  transformers.forEach((transformer) => transformer.hide());

  const previous = {
    scaleX: stage.scaleX(),
    scaleY: stage.scaleY(),
    x: stage.x(),
    y: stage.y(),
    width: stage.width(),
    height: stage.height()
  };

  try {
    stage.scaleX(1);
    stage.scaleY(1);
    stage.x(0);
    stage.y(0);
    stage.width(doc.width);
    stage.height(doc.height);
    return stage.toDataURL({ pixelRatio, mimeType: 'image/png' });
  } finally {
    stage.scaleX(previous.scaleX);
    stage.scaleY(previous.scaleY);
    stage.x(previous.x);
    stage.y(previous.y);
    stage.width(previous.width);
    stage.height(previous.height);
    transformers.forEach((transformer) => transformer.show());
    stage.batchDraw();
  }
}

/** dataURL → 纯 base64（去掉 data:...;base64, 前缀） */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** 触发浏览器下载 dataURL（客户端） */
export function downloadDataURL(dataUrl: string, filename: string): void {
  const link = window.document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
