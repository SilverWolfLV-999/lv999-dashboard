# Clerk Setup Guide

This guide covers the setup and configuration of Clerk features used in this project.

## Clerk Scopes Required

- **Authentication** - User sign-in/sign-up and session management
- **Organizations** - Multi-tenant workspace management (see setup below)

## Clerk Organizations Setup (Workspaces & Teams)

This starter kit includes multi-tenant workspace management powered by **Clerk Organizations**. To enable this feature:

### Enable Organizations in Clerk Dashboard:

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Navigate to **configure**
3. Click **Organizations settings**
4. Configure default roles if needed in the roles and permissions.

### Server-Side Permission Checks:

- This starter follows [Clerk's recommended patterns](https://clerk.com/blog/how-to-build-multitenant-authentication-with-clerk)

### Navigation RBAC System:

- Fully client-side navigation filtering using `useNav` hook
- Supports `requireOrg`, `permission`, and `role` checks (all client-side, instant)
- Configured in `src/config/nav-config.ts` with `access` properties
- See `docs/nav-rbac.md` for detailed documentation

### For more information, see:

- [Clerk Organizations documentation](https://clerk.com/docs/organizations/overview)
- [Multi-tenant authentication guide](https://clerk.com/blog/how-to-build-multitenant-authentication-with-clerk)
