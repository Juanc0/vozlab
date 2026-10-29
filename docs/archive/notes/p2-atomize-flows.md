# P2: Atomize auth/onboarding flows

Monolithic use cases (CompleteOidcLogin, etc.) should be split into small,
composable, auditable operations: Authenticate, ResolveTenants, SelectTenant,
RedeemInvitation, JoinEvent, RequestWorkspaceAccess, ApproveJoinRequest,
CreateWorkspace, ManageRole. Each independently testable; audit event per op.
IAuditLog port added. Further refactor deferred.