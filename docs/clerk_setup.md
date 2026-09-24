# Clerk 配置指南

本指南涵盖本项目中使用的 Clerk 功能的设置与配置。

## 所需的 Clerk 权限范围

- **Authentication（认证）** - 用户登录/注册与会话管理
- **Organizations（组织）** - 多租户工作区管理（参见下方设置）

## Clerk Organizations 设置（工作区与团队）

本启动套件包含基于 **Clerk Organizations** 的多租户工作区管理。要启用此功能：

### 在 Clerk Dashboard 中启用 Organizations：

1. 前往 [Clerk Dashboard](https://dashboard.clerk.com)
2. 导航到 **configure（配置）**
3. 点击 **Organizations settings（组织设置）**
4. 如需配置默认角色，请在角色与权限中进行设置

### 服务端权限检查：

- 本启动套件遵循 [Clerk 推荐的模式](https://clerk.com/blog/how-to-build-multitenant-authentication-with-clerk)

### 导航 RBAC 系统：

- 完全客户端的导航过滤，使用 `useNav` hook
- 支持 `requireOrg`、`permission` 和 `role` 检查（全部客户端，即时生效）
- 在 `src/config/nav-config.ts` 中通过 `access` 属性配置
- 详细文档请参见 `docs/nav-rbac.md`

### 更多信息，请参见：

- [Clerk Organizations 文档](https://clerk.com/docs/organizations/overview)
- [多租户认证指南](https://clerk.com/blog/how-to-build-multitenant-authentication-with-clerk)
