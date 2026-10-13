export function can(user: { permissions?: string[]; role?: string; role_normalized?: string; is_superuser?: boolean } | null | undefined, code: string) {
  if (!user) return false;
  const role = user.role_normalized || user.role;
  if (role === 'super_admin' || user.is_superuser) return true;
  return (user.permissions || []).includes(code);
}

export function roleLabel(role?: string) {
  const map: Record<string, string> = {
    super_admin: 'Super Admin',
    agency: 'Agency',
    manager: 'Manager',
    admin: 'Admin',
    user: 'User',
    supervisor: 'Manager',
    agent: 'User',
  };
  return map[role || ''] || role || 'User';
}
