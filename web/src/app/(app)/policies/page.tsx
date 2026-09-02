import { requireSection, hasAccess } from "@/server/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  listLocationOrderLimits,
  listBranchReceivingLimits,
  listRolePurchaseLimits,
  getPolicySettings,
  listRoles,
  listPoApprovalSteps,
  listLimitApprovers,
  listPendingLimitOverrideRequests,
  isDesignatedLimitApprover,
} from "@/server/db/queries/policies";
import { listBranches } from "@/server/db/queries/purchaseOrders";
import { listProfilesWithRole } from "@/server/db/queries/permissions";
import { POLICY_LOCATIONS } from "@/server/db/schema";
import { LocationLimits } from "@/components/policies/LocationLimits";
import { BranchReceivingLimits } from "@/components/policies/BranchReceivingLimits";
import { RolePurchaseLimits } from "@/components/policies/RolePurchaseLimits";
import { PolicyPercentSettings } from "@/components/policies/PolicyPercentSettings";
import { InternalOnlyLocations } from "@/components/policies/InternalOnlyLocations";
import { ApprovalPolicySettings } from "@/components/policies/ApprovalPolicySettings";
import { LimitApprovers } from "@/components/policies/LimitApprovers";
import { PendingLimitOverrides } from "@/components/policies/PendingLimitOverrides";
import { withTimeout } from "@/lib/withTimeout";

export default async function PoliciesPage() {
  const session = await requireSection("policies", "view");
  const canEdit = hasAccess(session, "policies", "edit");
  const [limits, branchLimits, roleLimits, settings, roles, branches, approvalSteps, approvers, profiles, pendingOverrides, isApprover] = await withTimeout(
    Promise.all([
      listLocationOrderLimits(),
      listBranchReceivingLimits(),
      listRolePurchaseLimits(),
      getPolicySettings(),
      listRoles(),
      listBranches(),
      listPoApprovalSteps(),
      listLimitApprovers(),
      listProfilesWithRole(),
      listPendingLimitOverrideRequests(),
      isDesignatedLimitApprover(session.profile.id),
    ]),
    20000,
    "This is taking longer than expected — please try again in a moment."
  );

  return (
    <>
      <PageHeader title="Policies & Approvals" subtitle="Real spending and receiving limits, checked live when you create a Purchase Order or GRN." />
      <div className="callout">
        Most of these are checked live as non-blocking warnings on the Purchase Order or GRN itself, the same way
        supplier-level ordering/receiving limits already work (set those on each supplier&apos;s detail page). The Purchase Order
        Approval setting and Per-Role Purchase Limits below are the exception — they actually block the action.
      </div>

      <ApprovalPolicySettings threshold={settings.poApprovalThreshold} steps={approvalSteps} roles={roles} canEdit={canEdit} />
      <RolePurchaseLimits roleLimits={roleLimits} canEdit={canEdit} />
      <LimitApprovers approvers={approvers} profiles={profiles} canEdit={canEdit} />
      <PendingLimitOverrides requests={pendingOverrides} isApprover={isApprover} />
      <LocationLimits limits={limits} locations={POLICY_LOCATIONS} canEdit={canEdit} />
      <BranchReceivingLimits limits={branchLimits} branches={branches} canEdit={canEdit} />
      <PolicyPercentSettings abovePparOverPct={settings.abovePparOverPct} receiveAbovePricePct={settings.receiveAbovePricePct} canEdit={canEdit} />
      <InternalOnlyLocations locations={POLICY_LOCATIONS} checked={settings.internalOnlyLocations} canEdit={canEdit} />
    </>
  );
}
