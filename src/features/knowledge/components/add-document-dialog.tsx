'use client';

import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as z from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Icons } from '@/components/icons';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';
import { ApiError } from '@/lib/api-client';
import { useAppForm } from '@/lib/form';
import { cn } from '@/lib/utils';
import { assetsQueryOptions } from '@/features/agent/api/queries';
import { getAssetKindMeta } from '@/features/agent/constants/kinds';
import { formatDateTime } from '@/features/agent/lib/format';
import { createKnowledgeDocumentMutation } from '../api/mutations';
import type { CreateDocumentRequest } from '../api/types';
import { IMPORTABLE_ASSET_KINDS } from '../constants/knowledge';

/** 单次拉取上限：只需最近一批文本资产，超出用搜索缩小范围 */
const ASSET_PAGE_LIMIT = 40;

/** 正文字数上限（服务端另有 100KB 字节上限，中文按 ~3 字/KB 留出余量） */
const CONTENT_MAX_LENGTH = 30000;

type TabValue = 'manual' | 'asset';

/**
 * 校验按 tab 分支：粘贴文本必须有正文；从资产导入必须选中一篇资产。
 * refine 的 path 会被 TanStack Form 映射为对应字段的错误（standard-schema 约定）。
 */
const addDocumentSchema = z
  .object({
    mode: z.enum(['manual', 'asset']),
    title: z.string().max(200, '标题不超过 200 字'),
    content: z.string(),
    sourceAssetId: z.string()
  })
  .refine((value) => value.mode !== 'manual' || value.content.trim().length > 0, {
    message: '请粘贴要存入知识库的文本',
    path: ['content']
  })
  .refine((value) => value.mode !== 'asset' || value.sourceAssetId.length > 0, {
    message: '请选择一篇文本资产',
    path: ['sourceAssetId']
  });

type AddDocumentValues = z.infer<typeof addDocumentSchema>;

function resolveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return '操作过于频繁，请稍后再试';
    if (error.status === 413) return '文本过大，请精简后再试';
    if (error.status === 404) return '所选资产不存在或已删除';
    if (error.status === 400) return '内容无法入库，请检查文本后重试';
  }
  return '加入知识库失败，请稍后重试';
}

interface AddDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 从资产行「加入知识库」进入时预选的资产（自动切到「从资产导入」tab） */
  initialAsset?: { id: string; title: string };
}

/** 选中的待导入资产（id 写入表单字段，title 仅用于展示已选 chip） */
interface SelectedAsset {
  id: string;
  title: string;
}

/**
 * 新增知识库文档对话框：两个 tab —— 手动粘贴文本 / 从文本资产导入（markdown、html）。
 * 提交后服务端同步完成「切分 → embedding → 落库」，成功即提示片段数；
 * 摄取失败（status=failed）不阻塞关闭，用户可在列表中「重新摄取」。
 */
export function AddDocumentDialog({ open, onOpenChange, initialAsset }: AddDocumentDialogProps) {
  const [tab, setTab] = useState<TabValue>('manual');
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);
  const mutation = useMutation(createKnowledgeDocumentMutation);

  const form = useAppForm({
    defaultValues: {
      mode: 'manual',
      title: '',
      content: '',
      sourceAssetId: ''
    } as AddDocumentValues,
    validators: { onSubmit: addDocumentSchema },
    onSubmit: async ({ value }) => {
      const title = value.title.trim();
      const payload: CreateDocumentRequest =
        value.mode === 'manual'
          ? { source: 'manual', ...(title && { title }), content: value.content }
          : { source: 'asset', ...(title && { title }), sourceAssetId: value.sourceAssetId };

      try {
        const result = await mutation.mutateAsync(payload);
        if (result.status === 'ready') {
          toast.success(`已加入知识库，切分为 ${result.chunkCount} 个片段`);
          onOpenChange(false);
        } else {
          toast.error('向量化失败，可在列表中「重新摄取」');
          onOpenChange(false);
        }
      } catch (error) {
        toast.error(resolveErrorMessage(error));
      }
    }
  });

  // 每次打开回到初始状态（关闭即丢弃草稿）；带预选资产时直接落在「从资产导入」
  // 依赖用基本类型（非 initialAsset 对象）：调用方每次渲染传入新对象也不会重置表单
  const initialAssetId = initialAsset?.id;
  const initialAssetTitle = initialAsset?.title;
  useEffect(() => {
    if (!open) return;
    form.reset();
    const preset = initialAssetId ? { id: initialAssetId, title: initialAssetTitle ?? '' } : null;
    setSelectedAsset(preset);
    const nextTab: TabValue = preset ? 'asset' : 'manual';
    setTab(nextTab);
    void form.setFieldValue('mode', nextTab);
    void form.setFieldValue('sourceAssetId', preset?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form 实例与 setter 为稳定引用，仅在 open / 预选资产变化时执行
  }, [open, initialAssetId, initialAssetTitle]);

  const handleSelectAsset = (asset: SelectedAsset | null) => {
    setSelectedAsset(asset);
    void form.setFieldValue('sourceAssetId', asset?.id ?? '');
  };

  const handleTabChange = (value: unknown) => {
    const next: TabValue = value === 'asset' ? 'asset' : 'manual';
    setTab(next);
    void form.setFieldValue('mode', next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>新增知识库文档</DialogTitle>
          <DialogDescription>
            存入后会自动切分并向量化；之后在 Agent 对话中提问，它会按语义检索这些资料并标注来源。
          </DialogDescription>
        </DialogHeader>

        {/* AppForm 不接受 id/className（仅 children），故用原生 form 元素 + handleSubmit；
            footer 的提交按钮经 form 属性关联本表单 */}
        <form
          id='knowledge-add-form'
          className='flex flex-col gap-4'
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.AppField
              name='title'
              children={(field) => (
                <field.TextField
                  label='标题'
                  placeholder='留空则自动取首行文本 / 资产标题'
                  maxLength={200}
                />
              )}
            />
          </FieldGroup>

          <Tabs value={tab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value='manual'>粘贴文本</TabsTrigger>
              <TabsTrigger value='asset'>从资产导入</TabsTrigger>
            </TabsList>

            <TabsContent value='manual'>
              <form.AppField
                name='content'
                children={(field) => (
                  <field.TextareaField
                    label='正文'
                    placeholder='粘贴笔记、资料、研究摘录…'
                    rows={12}
                    maxLength={CONTENT_MAX_LENGTH}
                    showCount
                    description='单篇上限约 3 万字（服务端按 100KB 计）'
                  />
                )}
              />
            </TabsContent>

            <TabsContent value='asset'>
              <form.AppField
                name='sourceAssetId'
                children={(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <div className='flex flex-col gap-3'>
                      {selectedAsset && (
                        <div className='flex items-center gap-2 rounded-md border px-3 py-2 text-sm'>
                          <Icons.post className='size-4 shrink-0' />
                          <span className='min-w-0 flex-1 truncate'>
                            已选：{selectedAsset.title}
                          </span>
                          <Button
                            type='button'
                            variant='ghost'
                            size='sm'
                            className='h-6 shrink-0 px-2'
                            onClick={() => handleSelectAsset(null)}
                          >
                            清除
                          </Button>
                        </div>
                      )}
                      <AssetPicker value={selectedAsset?.id ?? ''} onSelect={handleSelectAsset} />
                    </div>
                    {field.state.meta.errors.length > 0 && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )}
              />
            </TabsContent>
          </Tabs>
        </form>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            取消
          </Button>
          {/* 提交按钮在 footer（form 元素外），用 form 属性关联 */}
          <Button type='submit' form='knowledge-add-form' disabled={mutation.isPending}>
            {mutation.isPending ? <Icons.spinner className='animate-spin' /> : <Icons.add />}
            加入知识库
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AssetPickerProps {
  value: string;
  onSelect: (asset: SelectedAsset | null) => void;
}

/** 文本资产单选列表：标题搜索（防抖）+ 类型徽标，复用资产查询缓存域 */
function AssetPicker({ value, onSelect }: AssetPickerProps) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const debouncedSetSearch = useDebouncedCallback((next: string) => {
    setSearch(next.trim());
  }, 300);

  const { data, isLoading, isError } = useQuery({
    ...assetsQueryOptions({
      kind: IMPORTABLE_ASSET_KINDS,
      page: 1,
      limit: ASSET_PAGE_LIMIT,
      ...(search && { search })
    }),
    // 搜索时保留上一次结果，避免列表闪空
    placeholderData: keepPreviousData
  });
  const assets = data?.assets ?? [];

  return (
    <div className='flex flex-col gap-3'>
      <div className='relative'>
        <Icons.search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
        <Input
          value={searchInput}
          onChange={(event) => {
            const next = event.target.value;
            setSearchInput(next);
            debouncedSetSearch(next);
          }}
          placeholder='按标题搜索文本资产…'
          className='pl-8'
          aria-label='搜索文本资产'
        />
      </div>

      <div className='max-h-[40svh] min-h-32 overflow-y-auto'>
        {isLoading ? (
          <div className='text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm'>
            <Icons.spinner className='animate-spin' /> 加载中…
          </div>
        ) : isError ? (
          <div className='text-destructive py-10 text-center text-sm'>
            加载资产失败，请稍后重试。
          </div>
        ) : assets.length === 0 ? (
          <div className='text-muted-foreground py-10 text-center text-sm'>
            {search ? '没有匹配的文本资产，换个关键词试试。' : '还没有可导入的文本资产。'}
          </div>
        ) : (
          <ul className='flex flex-col gap-1.5'>
            {assets.map((asset) => {
              const { label, icon: KindIcon } = getAssetKindMeta(asset.kind);
              const isSelected = asset.id === value;
              return (
                <li key={asset.id}>
                  <button
                    type='button'
                    aria-pressed={isSelected}
                    onClick={() =>
                      onSelect(isSelected ? null : { id: asset.id, title: asset.title })
                    }
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
                      'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/60 hover:bg-muted/50'
                    )}
                  >
                    <span className='bg-muted flex size-8 shrink-0 items-center justify-center rounded-md'>
                      <KindIcon className='size-4' />
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-sm font-medium'>{asset.title}</span>
                      <span className='text-muted-foreground mt-0.5 block text-xs'>
                        {formatDateTime(asset.createdAt)}
                      </span>
                    </span>
                    <Badge variant='outline'>{label}</Badge>
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border'
                      )}
                    >
                      {isSelected && <Icons.check className='size-3.5' />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
