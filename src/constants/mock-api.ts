/**
 * Mock 工具：模拟网络延迟。
 * 仅供概览页（dashboard/overview 并行路由）的演示数据加载使用；
 * 原 products/users 演示数据于 2026-09-19 随模块移除一并清理。
 */

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
