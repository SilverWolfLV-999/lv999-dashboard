import { useReducer } from 'react';
import type { DesignDocument, DesignObject } from '../api/types';
import { reorderObject } from '../lib/document';

/**
 * 编辑器状态 = 文档三段历史（past/present/future）+ 当前选中。
 *
 * 纪律（Konva 官方）：一次完整用户操作提交一条历史（拖拽/变换只在结束时 dispatch 一次），
 * 而非每个指针事件一条；选中变化不入历史。
 */
export interface EditorState {
  past: DesignDocument[];
  present: DesignDocument;
  future: DesignDocument[];
  selectedId: string | null;
}

/** 对象可编辑字段的部分更新（几何 + 样式；不改 type/id） */
export type ObjectPatch = Partial<{
  x: number;
  y: number;
  rotation: number;
  fill: string;
  fontSize: number;
  fontStyle: string;
  cornerRadius: number;
  width: number;
  height: number;
  radius: number;
  text: string;
}>;

export type DocumentPatch = Partial<Pick<DesignDocument, 'width' | 'height' | 'background'>>;

export type EditorAction =
  | { type: 'set-document'; document: DesignDocument; selectedId?: string | null }
  | { type: 'add-object'; object: DesignObject }
  | { type: 'update-object'; id: string; patch: ObjectPatch }
  | { type: 'remove-object'; id: string }
  | { type: 'reorder'; id: string; direction: 'forward' | 'backward' }
  | { type: 'update-document'; patch: DocumentPatch }
  | { type: 'select'; id: string | null }
  | { type: 'undo' }
  | { type: 'redo' };

/** 历史栈上限（文档为纯引用数据、体积小，仍设上限防无界增长） */
const HISTORY_LIMIT = 100;

function pushHistory(
  state: EditorState,
  present: DesignDocument,
  selectedId: string | null = state.selectedId
): EditorState {
  const past = [...state.past, state.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present, future: [], selectedId };
}

/** undo/redo 后：选中对象若已不存在则取消选中 */
function reconcileSelection(document: DesignDocument, selectedId: string | null): string | null {
  if (!selectedId) return null;
  return document.objects.some((object) => object.id === selectedId) ? selectedId : null;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'set-document':
      return {
        past: [],
        present: action.document,
        future: [],
        selectedId: action.selectedId ?? null
      };

    case 'add-object':
      return pushHistory(
        state,
        { ...state.present, objects: [...state.present.objects, action.object] },
        action.object.id
      );

    case 'update-object': {
      let changed = false;
      const objects = state.present.objects.map((object) => {
        if (object.id !== action.id) return object;
        changed = true;
        return { ...object, ...action.patch } as DesignObject;
      });
      // 无实际变化（如未移动的 dragEnd）不入历史
      if (!changed) return state;
      return pushHistory(state, { ...state.present, objects });
    }

    case 'remove-object': {
      const objects = state.present.objects.filter((object) => object.id !== action.id);
      if (objects.length === state.present.objects.length) return state;
      const selectedId = state.selectedId === action.id ? null : state.selectedId;
      return pushHistory(state, { ...state.present, objects }, selectedId);
    }

    case 'reorder': {
      const objects = reorderObject(state.present.objects, action.id, action.direction);
      if (objects === state.present.objects) return state;
      return pushHistory(state, { ...state.present, objects });
    }

    case 'update-document':
      return pushHistory(state, { ...state.present, ...action.patch });

    case 'select':
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id };

    case 'undo': {
      if (state.past.length === 0) return state;
      const present = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present,
        future: [state.present, ...state.future],
        selectedId: reconcileSelection(present, state.selectedId)
      };
    }

    case 'redo': {
      if (state.future.length === 0) return state;
      const [present, ...rest] = state.future;
      return {
        past: [...state.past, state.present],
        present,
        future: rest,
        selectedId: reconcileSelection(present, state.selectedId)
      };
    }

    default:
      return state;
  }
}

export function useEditorReducer(initialDocument: DesignDocument) {
  return useReducer(
    editorReducer,
    initialDocument,
    (document): EditorState => ({ past: [], present: document, future: [], selectedId: null })
  );
}
