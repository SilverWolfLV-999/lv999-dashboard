import type { InfobarContent } from '@/components/ui/infobar';

export const workspacesInfoContent: InfobarContent = {
  title: '工作区管理',
  sections: [
    {
      title: '概览',
      description:
        '工作区页面用于管理并切换工作区。该功能由 Clerk Organizations 驱动，支持多租户工作区管理。你可以查看全部工作区、创建新工作区，并切换当前活动工作区。',
      links: [
        {
          title: 'Clerk Organizations 文档',
          url: 'https://clerk.com/docs/organizations/overview'
        }
      ]
    },
    {
      title: '创建工作区',
      description:
        '要创建工作区，请点击「Create Organization」按钮，输入工作区名称并完成初始设置。创建完成后即可切换到新工作区并进行管理。',
      links: [
        {
          title: '多租户认证指南',
          url: 'https://clerk.com/blog/how-to-build-multitenant-authentication-with-clerk'
        }
      ]
    },
    {
      title: '切换工作区',
      description:
        '点击列表中的工作区即可完成切换。选中的工作区将成为你的活动组织上下文，所有组织相关功能都会使用该工作区。',
      links: []
    },
    {
      title: '工作区特性',
      description:
        '每个工作区独立运行，拥有各自的团队成员、角色、权限与计费。你可以在同一账号下管理多个项目或团队，同时保持数据与设置相互隔离。',
      links: []
    },
    {
      title: '服务端权限校验',
      description:
        '本应用遵循 Clerk 推荐的多租户认证模式。服务端权限校验确保用户只能访问其活动组织下的资源。',
      links: [
        {
          title: 'Clerk Organizations 文档',
          url: 'https://clerk.com/docs/organizations/overview'
        }
      ]
    }
  ]
};

export const teamInfoContent: InfobarContent = {
  title: '团队管理',
  sections: [
    {
      title: '概览',
      description:
        '团队管理页面用于管理团队成员、角色与安全设置等，基于 Clerk 的 OrganizationProfile 组件提供完整的组织管理能力。',
      links: [
        {
          title: 'Clerk Organizations 文档',
          url: 'https://clerk.com/docs/organizations/overview'
        }
      ]
    },
    {
      title: '管理团队成员',
      description:
        '你可以在此页面添加、移除和管理团队成员：通过邮箱邀请新成员、分配角色并控制其访问级别。每个成员可根据所持角色拥有不同的权限。',
      links: []
    },
    {
      title: '角色与权限',
      description:
        '在 Clerk Dashboard 的 Organizations 设置中配置默认角色与权限。角色决定团队成员在工作区内可以执行的操作，常见角色包括 admin、member 以及你自定义的角色。',
      links: [
        {
          title: 'Clerk Organizations 文档',
          url: 'https://clerk.com/docs/organizations/overview'
        }
      ]
    },
    {
      title: '安全设置',
      description:
        '管理组织的安全设置，包括认证要求、会话管理与访问控制，帮助保护组织的数据与资源。',
      links: []
    },
    {
      title: '组织设置',
      description:
        '配置名称、Logo 以及工作区偏好等常规组织设置。这些设置作用于整个工作区，影响所有团队成员。',
      links: []
    },
    {
      title: '导航 RBAC 系统',
      description:
        '本应用包含基于 `useNav` hook 的纯客户端导航过滤系统，支持 `requireOrg`、`permission` 与 `role` 检查，实现即时访问控制。导航项在 `src/config/nav-config.ts` 中通过 `access` 属性配置。',
      links: []
    }
  ]
};
