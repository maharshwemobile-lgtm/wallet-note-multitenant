import { getAuthUser } from "./auth";
import { prisma } from "./prisma";

/** Who may read the cross-tenant admin panel.
 *
 *  There is no passcode. Nobody types a secret to get in — access follows from who is
 *  signed in, and that is the whole of it.
 *
 *  It cannot simply be "any signed-in Owner", though. Every account in this deployment is
 *  an Owner of its own business, so that check lets any registered user read all of them —
 *  and since anyone can register with Google, that is everyone. The panel reports other
 *  businesses' names, their users, and their audit history, which is not ours to hand out.
 *
 *  So the list is named explicitly, by username or email, in ADMIN_USERS. Empty means
 *  nobody, because a panel that opens to everyone when a setting is missing is the failure
 *  worth avoiding.
 */
export function adminUsers(): string[] {
  return (process.env.ADMIN_USERS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminIdentity(
  user: { username?: string | null; email?: string | null } | null | undefined
): boolean {
  if (!user) return false;
  const allowed = adminUsers();
  if (allowed.length === 0) return false;
  const username = user.username?.toLowerCase();
  const email = user.email?.toLowerCase();
  return (
    (username !== undefined && username !== null && allowed.includes(username)) ||
    (email !== undefined && email !== null && allowed.includes(email))
  );
}

/** True when the caller's session belongs to someone on the list. */
export async function isAdminRequest(): Promise<boolean> {
  if (adminUsers().length === 0) return false;
  const session = await getAuthUser();
  if (!session) return false;
  // The session carries the username; the email is read alongside it so the list can name
  // either — a Google signup's username is derived, and its address is what a person knows.
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { username: true, email: true, active: true, deletedAt: true },
  });
  if (!user || !user.active || user.deletedAt) return false;
  return isAdminIdentity(user);
}
