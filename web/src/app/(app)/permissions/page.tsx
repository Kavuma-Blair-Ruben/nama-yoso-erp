import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { listRolesWithPermissions, listProfilesWithRole, listUnlinkedAuthUsers } from "@/server/db/queries/permissions";
import { UsersList } from "@/components/permissions/UsersList";
import { InviteUserForm } from "@/components/permissions/InviteUserForm";
import { LinkUserForm } from "@/components/permissions/LinkUserForm";
import { RolesList } from "@/components/permissions/RolesList";
import { withTimeout } from "@/lib/withTimeout";

export default async function PermissionsPage() {
  const session = await requireSection("permissions", "view");
  const canEdit = hasAccess(session, "permissions", "edit");
  const [roles, profiles, unlinkedUsers] = await withTimeout(
    Promise.all([listRolesWithPermissions(), listProfilesWithRole(), listUnlinkedAuthUsers()]),
    20000,
    "This is taking longer than expected — please try again in a moment."
  );

  return (
    <>
      <PageHeader title="User Permission" subtitle="Users and roles for this system — each role sets a No Access / View Only / Full Access level per section." />
      <div className="callout">
        Access is enforced at the page level and inside every write action — a user with &quot;View Only&quot; for a section can see it but every
        edit control is blocked, both in the UI and on the server.
      </div>

      <UsersList profiles={profiles} roles={roles.map((r) => ({ id: r.id, name: r.name }))} canEdit={canEdit} currentUserId={session.profile.id} />
      {canEdit && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <InviteUserForm roles={roles.map((r) => ({ id: r.id, name: r.name }))} />
          <LinkUserForm unlinkedUsers={unlinkedUsers} roles={roles.map((r) => ({ id: r.id, name: r.name }))} />
        </div>
      )}
      <RolesList roles={roles} canEdit={canEdit} />
    </>
  );
}
