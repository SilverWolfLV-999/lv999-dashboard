import type { Box } from './document';

/**
 * 拖拽吸附计算（纯函数，无 Konva 依赖）。
 *
 * 口径：以「移动框」（拖动对象或多选整体框的 AABB）的 left/center-x/right 与
 * top/center-y/bottom 为候选，对齐到其他对象与画布的同名边/中线；阈值内取最近命中，
 * 返回吸附后的移动框左上角坐标 + 命中的参考线。旋转对象以其 AABB 近似（见 document.objectBounds）。
 */

/** 参考线：v = 竖线（x = coord），h = 横线（y = coord） */
export interface Guide {
  type: 'v' | 'h';
  coord: number;
}

export interface SnapResult {
  /** 吸附后移动框左上角 x（未命中则等于入参 x） */
  x: number;
  /** 吸附后移动框左上角 y（未命中则等于入参 y） */
  y: number;
  /** 命中的参考线（0..2 条） */
  guides: Guide[];
}

/** 屏幕像素吸附阈值 → 文档坐标阈值（随 zoom 缩放，保证屏幕体验恒定） */
export function snapThreshold(screenThreshold: number, zoom: number): number {
  return screenThreshold / (zoom > 0 ? zoom : 1);
}

/** 收集一个框的三条垂直候选（left/center-x/right）与三条水平候选（top/center-y/bottom） */
function verticalCandidates(box: Box): number[] {
  return [box.x, box.x + box.width / 2, box.x + box.width];
}

function horizontalCandidates(box: Box): number[] {
  return [box.y, box.y + box.height / 2, box.y + box.height];
}

export function computeSnap(
  moving: Box,
  targets: Box[],
  canvas: Box,
  threshold: number
): SnapResult {
  // 目标候选 = 其他对象 + 画布（边缘与中线）
  const targetXs: number[] = [];
  const targetYs: number[] = [];
  for (const box of targets) {
    targetXs.push(...verticalCandidates(box));
    targetYs.push(...horizontalCandidates(box));
  }
  targetXs.push(...verticalCandidates(canvas));
  targetYs.push(...horizontalCandidates(canvas));

  // 取阈值内最近的垂直吸附（dx = 目标坐标 - 移动框候选坐标）
  let bestDx = 0;
  let bestVDist = Infinity;
  let bestVCoord: number | null = null;
  for (const mx of verticalCandidates(moving)) {
    for (const tx of targetXs) {
      const distance = Math.abs(tx - mx);
      if (distance <= threshold && distance < bestVDist) {
        bestVDist = distance;
        bestDx = tx - mx;
        bestVCoord = tx;
      }
    }
  }

  let bestDy = 0;
  let bestHDist = Infinity;
  let bestHCoord: number | null = null;
  for (const my of horizontalCandidates(moving)) {
    for (const ty of targetYs) {
      const distance = Math.abs(ty - my);
      if (distance <= threshold && distance < bestHDist) {
        bestHDist = distance;
        bestDy = ty - my;
        bestHCoord = ty;
      }
    }
  }

  const guides: Guide[] = [];
  if (bestVCoord !== null) guides.push({ type: 'v', coord: bestVCoord });
  if (bestHCoord !== null) guides.push({ type: 'h', coord: bestHCoord });

  return { x: moving.x + bestDx, y: moving.y + bestDy, guides };
}

/** 参考线是否等价（避免拖拽中每次像素移动都 setState 触发重渲染） */
export function sameGuides(a: Guide[], b: Guide[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ga = a[i];
    const gb = b[i];
    if (ga.type !== gb.type || Math.abs(ga.coord - gb.coord) > 0.01) return false;
  }
  return true;
}
