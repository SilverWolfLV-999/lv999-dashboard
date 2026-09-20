'use client';

import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject
} from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { createDesignMutation, updateDesignMutation } from '../api/mutations';
import type { DesignDocument, DesignObject } from '../api/types';
import { ZOOM_MAX, ZOOM_MIN } from '../constants/canvas';
import { useEditorReducer, type EditorAction, type ObjectPatch } from '../hooks/use-editor-reducer';
import { createImageObject, createShapeObject, type Point } from './document';
import { dataUrlToBase64, downloadDataURL, exportStageToDataURL } from './export';

interface EditorContextValue {
  // 文档与选择
  document: DesignDocument;
  objects: DesignObject[];
  selectedId: string | null;
  selectedObject: DesignObject | null;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  dispatch: Dispatch<EditorAction>;

  // 对象操作（稳定回调）
  select: (id: string | null) => void;
  commitObject: (id: string, patch: ObjectPatch) => void;
  removeObject: (id: string) => void;
  reorder: (id: string, direction: 'forward' | 'backward') => void;
  updateDocument: (patch: Partial<Pick<DesignDocument, 'width' | 'height' | 'background'>>) => void;
  undo: () => void;
  redo: () => void;
  addShape: (type: 'rect' | 'circle' | 'text') => void;
  insertImage: (assetId: string, natural: { width: number; height: number } | null) => void;

  // 相机（缩放/平移）
  zoom: number;
  position: Point;
  stageRef: RefObject<Konva.Stage | null>;
  containerSize: { width: number; height: number };
  setContainerSize: (size: { width: number; height: number }) => void;
  handleWheel: (event: KonvaEventObject<WheelEvent>) => void;
  panTo: (position: Point) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: () => void;

  // 文字编辑 overlay
  editingTextId: string | null;
  startTextEdit: (id: string) => void;
  endTextEdit: () => void;
  commitText: (id: string, text: string) => void;

  // 资产与保存
  assetId: string | null;
  title: string;
  setTitle: (title: string) => void;
  isSaving: boolean;
  save: () => Promise<void>;
  exportPng: () => void;
}

const EditorContext = createContext<EditorContextValue | null>(null);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface EditorProviderProps {
  /** 已存 design 资产 id；新建时为 null */
  assetId: string | null;
  initialTitle: string;
  initialDocument: DesignDocument;
  children: ReactNode;
}

export function EditorProvider({
  assetId,
  initialTitle,
  initialDocument,
  children
}: EditorProviderProps) {
  const router = useRouter();
  const [state, dispatch] = useEditorReducer(initialDocument);
  const [title, setTitle] = useState(initialTitle);

  // 相机：state 供渲染（Stage 受控 + overlay 定位 + 工具栏百分比）；ref 供事件处理同步读取（快速滚轮不丢帧）
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const positionRef = useRef<Point>({ x: 0, y: 0 });

  const [containerSize, setContainerSizeState] = useState({ width: 0, height: 0 });
  const containerSizeRef = useRef({ width: 0, height: 0 });

  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  const stageRef = useRef<Konva.Stage | null>(null);

  // latest refs：让 save/export/相机回调保持稳定引用（读最新值）
  const stateRef = useRef(state);
  stateRef.current = state;
  const titleRef = useRef(title);
  titleRef.current = title;
  const createdIdRef = useRef<string | null>(null);
  const savedSnapshotRef = useRef<string>(JSON.stringify(initialDocument));
  const hasFittedRef = useRef(false);

  const { mutateAsync: createDesign, isPending: isCreating } = useMutation(createDesignMutation);
  const { mutateAsync: updateDesign, isPending: isUpdating } = useMutation(updateDesignMutation);

  const applyCamera = useCallback((nextZoom: number, nextPosition: Point) => {
    zoomRef.current = nextZoom;
    positionRef.current = nextPosition;
    setZoom(nextZoom);
    setPosition(nextPosition);
  }, []);

  const setContainerSize = useCallback((size: { width: number; height: number }) => {
    containerSizeRef.current = size;
    setContainerSizeState(size);
  }, []);

  /** 视口中心对应的文档坐标（新对象放置点） */
  const getViewportCenter = useCallback((): Point => {
    const { width, height } = containerSizeRef.current;
    const doc = stateRef.current.present;
    if (!width || !height) return { x: doc.width / 2, y: doc.height / 2 };
    const scale = zoomRef.current;
    return {
      x: (width / 2 - positionRef.current.x) / scale,
      y: (height / 2 - positionRef.current.y) / scale
    };
  }, []);

  const fitToScreen = useCallback(() => {
    const { width, height } = containerSizeRef.current;
    if (!width || !height) return;
    const doc = stateRef.current.present;
    const padding = 48;
    const scale = clamp(
      Math.min((width - padding * 2) / doc.width, (height - padding * 2) / doc.height),
      ZOOM_MIN,
      ZOOM_MAX
    );
    applyCamera(scale, {
      x: (width - doc.width * scale) / 2,
      y: (height - doc.height * scale) / 2
    });
  }, [applyCamera]);

  // 首次量到容器尺寸时自适应
  useEffect(() => {
    if (hasFittedRef.current) return;
    if (containerSize.width > 0 && containerSize.height > 0) {
      hasFittedRef.current = true;
      fitToScreen();
    }
  }, [containerSize, fitToScreen]);

  const select = useCallback((id: string | null) => dispatch({ type: 'select', id }), [dispatch]);
  const commitObject = useCallback(
    (id: string, patch: ObjectPatch) => dispatch({ type: 'update-object', id, patch }),
    [dispatch]
  );
  const removeObject = useCallback(
    (id: string) => dispatch({ type: 'remove-object', id }),
    [dispatch]
  );
  const reorder = useCallback(
    (id: string, direction: 'forward' | 'backward') => dispatch({ type: 'reorder', id, direction }),
    [dispatch]
  );
  const updateDocument = useCallback(
    (patch: Partial<Pick<DesignDocument, 'width' | 'height' | 'background'>>) =>
      dispatch({ type: 'update-document', patch }),
    [dispatch]
  );
  const undo = useCallback(() => dispatch({ type: 'undo' }), [dispatch]);
  const redo = useCallback(() => dispatch({ type: 'redo' }), [dispatch]);

  const addShape = useCallback(
    (type: 'rect' | 'circle' | 'text') => {
      const object = createShapeObject(type, getViewportCenter());
      dispatch({ type: 'add-object', object });
    },
    [dispatch, getViewportCenter]
  );

  const insertImage = useCallback(
    (imageAssetId: string, natural: { width: number; height: number } | null) => {
      const object = createImageObject(imageAssetId, getViewportCenter(), natural);
      dispatch({ type: 'add-object', object });
    },
    [dispatch, getViewportCenter]
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const { width, height } = containerSizeRef.current;
      const oldScale = zoomRef.current;
      const newScale = clamp(oldScale * factor, ZOOM_MIN, ZOOM_MAX);
      if (newScale === oldScale) return;
      // 相对视口中心缩放
      const center = { x: width / 2, y: height / 2 };
      const docPoint = {
        x: (center.x - positionRef.current.x) / oldScale,
        y: (center.y - positionRef.current.y) / oldScale
      };
      applyCamera(newScale, {
        x: center.x - docPoint.x * newScale,
        y: center.y - docPoint.y * newScale
      });
    },
    [applyCamera]
  );

  const zoomIn = useCallback(() => zoomBy(1.2), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / 1.2), [zoomBy]);

  /** 平移提交：Stage 拖拽结束时把命令式位置写回相机状态 */
  const panTo = useCallback((next: Point) => applyCamera(zoomRef.current, next), [applyCamera]);

  // 相对指针缩放（Konva 官方范式）
  const handleWheel = useCallback(
    (event: KonvaEventObject<WheelEvent>) => {
      event.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const oldScale = zoomRef.current;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const factor = event.evt.deltaY > 0 ? 1 / 1.1 : 1.1;
      const newScale = clamp(oldScale * factor, ZOOM_MIN, ZOOM_MAX);
      if (newScale === oldScale) return;
      const docPoint = {
        x: (pointer.x - positionRef.current.x) / oldScale,
        y: (pointer.y - positionRef.current.y) / oldScale
      };
      applyCamera(newScale, {
        x: pointer.x - docPoint.x * newScale,
        y: pointer.y - docPoint.y * newScale
      });
    },
    [applyCamera]
  );

  const startTextEdit = useCallback((id: string) => setEditingTextId(id), []);
  const endTextEdit = useCallback(() => setEditingTextId(null), []);
  const commitText = useCallback(
    (id: string, text: string) => {
      dispatch({ type: 'update-object', id, patch: { text } });
      setEditingTextId(null);
    },
    [dispatch]
  );

  const exportPng = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      const dataUrl = exportStageToDataURL(stage, stateRef.current.present, {
        maxDimension: 2560,
        maxPixelRatio: 2
      });
      const safeTitle = titleRef.current.replace(/[\\/:*?"<>|]/g, '-').trim() || '未命名设计';
      downloadDataURL(dataUrl, `${safeTitle}.png`);
    } catch (error) {
      console.error('[design] export failed', error);
      toast.error('导出失败，请重试');
    }
  }, []);

  const save = useCallback(async () => {
    const stage = stageRef.current;
    const doc = stateRef.current.present;
    const currentTitle = titleRef.current.trim() || '未命名设计';

    // 导出预览 PNG（失败不阻塞保存：文档本身仍完整落库）
    let previewPng: string | undefined;
    if (stage) {
      try {
        const dataUrl = exportStageToDataURL(stage, doc, {
          maxDimension: 1280,
          maxPixelRatio: 1.5
        });
        previewPng = dataUrlToBase64(dataUrl);
      } catch (error) {
        console.error('[design] preview export failed', error);
      }
    }

    try {
      const existingId = createdIdRef.current ?? assetId;
      if (existingId) {
        await updateDesign({
          id: existingId,
          values: { title: currentTitle, document: doc, previewPng }
        });
        savedSnapshotRef.current = JSON.stringify(doc);
        toast.success('已保存');
      } else {
        const { id } = await createDesign({ title: currentTitle, document: doc, previewPng });
        createdIdRef.current = id;
        savedSnapshotRef.current = JSON.stringify(doc);
        toast.success('已创建');
        // 真实导航进入 [id]（沿用 agent 新建会话范式）；页面会以刚保存的文档重新挂载
        router.replace(`/dashboard/design/${id}`);
      }
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 429
          ? '操作过于频繁，请稍后再试'
          : error instanceof ApiError && error.status === 413
            ? '预览图过大，保存失败'
            : '保存失败，请重试';
      toast.error(message);
    }
  }, [assetId, createDesign, updateDesign, router]);

  // 键盘快捷键（文字编辑态让位于原生输入，避免抢键/破坏 IME）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (editingTextId) {
        if (event.key === 'Escape') endTextEdit();
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
        return;
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      const current = stateRef.current;
      if (!current.selectedId) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeObject(current.selectedId);
        return;
      }
      if (event.key === 'Escape') {
        select(null);
        return;
      }
      const arrows: Record<string, Point> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 }
      };
      const delta = arrows[event.key];
      if (delta) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const obj = current.present.objects.find((o) => o.id === current.selectedId);
        if (obj) {
          commitObject(obj.id, { x: obj.x + delta.x * step, y: obj.y + delta.y * step });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingTextId, endTextEdit, save, undo, redo, removeObject, select, commitObject]);

  const selectedObject = useMemo(
    () => state.present.objects.find((object) => object.id === state.selectedId) ?? null,
    [state.present.objects, state.selectedId]
  );

  const isDirty = JSON.stringify(state.present) !== savedSnapshotRef.current;

  const value = useMemo<EditorContextValue>(
    () => ({
      document: state.present,
      objects: state.present.objects,
      selectedId: state.selectedId,
      selectedObject,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      isDirty,
      dispatch,
      select,
      commitObject,
      removeObject,
      reorder,
      updateDocument,
      undo,
      redo,
      addShape,
      insertImage,
      zoom,
      position,
      stageRef,
      containerSize,
      setContainerSize,
      handleWheel,
      panTo,
      zoomIn,
      zoomOut,
      fitToScreen,
      editingTextId,
      startTextEdit,
      endTextEdit,
      commitText,
      assetId,
      title,
      setTitle,
      isSaving: isCreating || isUpdating,
      save,
      exportPng
    }),
    [
      state,
      selectedObject,
      isDirty,
      dispatch,
      select,
      commitObject,
      removeObject,
      reorder,
      updateDocument,
      undo,
      redo,
      addShape,
      insertImage,
      zoom,
      position,
      containerSize,
      setContainerSize,
      handleWheel,
      panTo,
      zoomIn,
      zoomOut,
      fitToScreen,
      editingTextId,
      startTextEdit,
      endTextEdit,
      commitText,
      assetId,
      title,
      isCreating,
      isUpdating,
      save,
      exportPng
    ]
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
}
