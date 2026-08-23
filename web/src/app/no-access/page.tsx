import Link from "next/link";
import { getSession } from "@/server/auth/session";

export default async function NoAccessPage() {
  const session = await getSession();
  return (
    <div className="access-restricted">
      <div className="panel access-restricted-panel">
        <div className="access-restricted-icon">🔒</div>
        <h3>No access to this section</h3>
        <div className="access-restricted-body">
          {session ? (
            <>
              Your role, <b>{session.role.name}</b>, does not include access to this part of the system. Ask an
              Owner/Admin to update permissions.
            </>
          ) : (
            "You need to sign in to view this page."
          )}
        </div>
        <Link className="btn accent" href="/dashboard">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
