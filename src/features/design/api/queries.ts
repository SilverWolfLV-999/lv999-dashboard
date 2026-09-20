import { assetsQueryOptions, assetQueryOptions } from '@/features/agent/api/queries';

/**
 * design 本质就是一种 asset（kind='design'），读取直接复用 agent 资产域查询：
 * - assetQueryOptions(id)：读取单个 design 详情（content 即文档 JSON）
 * - assetsQueryOptions({ kind: 'image' })：「插入图片」选择器列出图片资产
 *
 * 复用同一 query key，与「我的资产」表格共享缓存；保存后由 agent 域统一失效。
 */
export { assetsQueryOptions, assetQueryOptions };
