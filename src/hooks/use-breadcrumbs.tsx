'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { navGroups } from '@/config/nav-config';

type BreadcrumbItem = {
  title: string;
  link: string;
};

// 从导航配置构建「路径 -> 标题」映射，保证面包屑与侧边栏文案一致
const navTitleMap: Record<string, string> = {};
for (const group of navGroups) {
  for (const item of group.items) {
    if (item.url && item.url !== '#') navTitleMap[item.url] = item.title;
    for (const child of item.items ?? []) {
      if (child.url && child.url !== '#') navTitleMap[child.url] = child.title;
    }
  }
}

// 导航配置未直接覆盖的路径段兜底映射
const segmentTitleMap: Record<string, string> = {
  dashboard: '仪表盘',
  profile: '个人资料'
};

export function useBreadcrumbs() {
  const pathname = usePathname();

  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const segments = pathname.split('/').filter(Boolean);

    const items = segments.map((segment, index) => {
      const path = `/${segments.slice(0, index + 1).join('/')}`;
      return {
        title:
          navTitleMap[path] ??
          segmentTitleMap[segment] ??
          segment.charAt(0).toUpperCase() + segment.slice(1),
        link: path
      };
    });

    // 相邻层级标题重复时只保留更深一级（如 /dashboard 与 /dashboard/overview 均为「仪表盘」）
    return items.filter((item, index) => item.title !== items[index + 1]?.title);
  }, [pathname]);

  return breadcrumbs;
}
