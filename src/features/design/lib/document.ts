import { OBJECT_DEFAULTS } from '../constants/canvas';
import {
  designDocumentSchema,
  type DesignDocument,
  type DesignObject,
  type ImageObject
} from '../api/types';

/**
 * 文档纯数据操作（无 Konva 依赖）：对象工厂、层级重排、文档解析。
 * 保持文档自持有可序列化——Konva 节点只在交互结束时把值写回这里。
 */

let idCounter = 0;

/** 生成文档内唯一对象 id（优先 crypto.randomUUID，回退计数器） */
export function generateObjectId(): string {
  idCounter += 1;
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  return `obj-${Date.now().toString(36)}-${idCounter}`;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * 新建图形/文字对象，使其视觉中心落在 center。
 * Konva 中 Rect/Text 的 x,y 为左上角、Circle 的 x,y 为圆心，故按类型偏移。
 */
export function createShapeObject(type: 'rect' | 'circle' | 'text', center: Point): DesignObject {
  const id = generateObjectId();
  if (type === 'rect') {
    const d = OBJECT_DEFAULTS.rect;
    return {
      id,
      type: 'rect',
      x: center.x - d.width / 2,
      y: center.y - d.height / 2,
      rotation: 0,
      width: d.width,
      height: d.height,
      fill: d.fill,
      cornerRadius: d.cornerRadius
    };
  }
  if (type === 'circle') {
    const d = OBJECT_DEFAULTS.circle;
    return {
      id,
      type: 'circle',
      x: center.x,
      y: center.y,
      rotation: 0,
      radius: d.radius,
      fill: d.fill
    };
  }
  const d = OBJECT_DEFAULTS.text;
  // 文字宽度未知，按字号粗略估算居中偏移
  const approxWidth = d.text.length * d.fontSize * 0.6;
  return {
    id,
    type: 'text',
    x: center.x - approxWidth / 2,
    y: center.y - d.fontSize / 2,
    rotation: 0,
    text: d.text,
    fontSize: d.fontSize,
    fill: d.fill,
    fontStyle: d.fontStyle
  };
}

/**
 * 新建图片对象：按自然尺寸等比缩放到 maxBox 内（保持宽高比），中心落在 center。
 * natural 缺省（缩略图尚未加载）时回退为正方形。
 */
export function createImageObject(
  assetId: string,
  center: Point,
  natural: { width: number; height: number } | null,
  maxBox = 600
): ImageObject {
  const ratio = natural && natural.height > 0 ? natural.width / natural.height : 1;
  let width = maxBox;
  let height = maxBox;
  if (ratio >= 1) {
    width = maxBox;
    height = maxBox / ratio;
  } else {
    height = maxBox;
    width = maxBox * ratio;
  }
  return {
    id: generateObjectId(),
    type: 'image',
    x: center.x - width / 2,
    y: center.y - height / 2,
    rotation: 0,
    assetId,
    width: Math.round(width),
    height: Math.round(height)
  };
}

/** 层级重排：forward 上移一层 / backward 下移一层（数组末尾为最上层） */
export function reorderObject(
  objects: DesignObject[],
  id: string,
  direction: 'forward' | 'backward'
): DesignObject[] {
  const index = objects.findIndex((object) => object.id === id);
  if (index < 0) return objects;
  const target = direction === 'forward' ? index + 1 : index - 1;
  if (target < 0 || target >= objects.length) return objects;
  const next = objects.slice();
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * 批量层级重排：把选中的一组对象整体前/后移一层，保持组内相对顺序。
 * 逐位扫描并与相邻的「非选中」对象交换一次（forward 自顶向下、backward 自底向上），
 * 保证每个选中项恰好移动一步；无可移动项时原样返回（引用不变，供 reducer 跳过入历史）。
 */
export function reorderObjects(
  objects: DesignObject[],
  ids: string[],
  direction: 'forward' | 'backward'
): DesignObject[] {
  if (ids.length === 0) return objects;
  const idSet = new Set(ids);
  const next = objects.slice();
  let moved = false;
  if (direction === 'forward') {
    for (let i = next.length - 2; i >= 0; i--) {
      if (idSet.has(next[i].id) && !idSet.has(next[i + 1].id)) {
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
        moved = true;
      }
    }
  } else {
    for (let i = 1; i < next.length; i++) {
      if (idSet.has(next[i].id) && !idSet.has(next[i - 1].id)) {
        [next[i], next[i - 1]] = [next[i - 1], next[i]];
        moved = true;
      }
    }
  }
  return moved ? next : objects;
}

/** 轴对齐包围盒（文档坐标） */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 对象的轴对齐包围盒（吸附/对齐共用的几何口径）。
 * 未旋转时精确；旋转对象以其未旋转尺寸近似（MVP 取舍，精确旋转吸附延后）。
 * 文字宽高按字号与行数估算（Konva 未渲染时的近似度量）。
 */
export function objectBounds(object: DesignObject): Box {
  switch (object.type) {
    case 'rect':
    case 'image':
      return { x: object.x, y: object.y, width: object.width, height: object.height };
    case 'circle':
      return {
        x: object.x - object.radius,
        y: object.y - object.radius,
        width: object.radius * 2,
        height: object.radius * 2
      };
    case 'text': {
      const lines = object.text.split('\n');
      const longest = lines.reduce((max, line) => Math.max(max, line.length), 1);
      const width = object.width ?? Math.max(1, longest * object.fontSize * 0.6);
      const height = Math.max(1, lines.length) * object.fontSize * 1.2;
      return { x: object.x, y: object.y, width, height };
    }
  }
}

/** 求若干包围盒的并集（多选取舍的整体框）；空数组返回 null */
export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * 克隆对象用于复制/粘贴：强制生成新 id（绝不复用源 id），位置按 offset 平移。
 * 图片对象只克隆 assetId 引用（不复制字节，符合 Konva 铁律）。
 */
export function cloneObjectWithOffset(object: DesignObject, offset: number): DesignObject {
  return {
    ...object,
    id: generateObjectId(),
    x: object.x + offset,
    y: object.y + offset
  } as DesignObject;
}

/** 解析并校验已存文档 JSON；无效返回 null（调用方回退空白文档） */
export function parseDesignDocument(content: string | null | undefined): DesignDocument | null {
  if (!content) return null;
  try {
    const parsed = designDocumentSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
