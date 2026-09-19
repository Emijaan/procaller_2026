export function can(user: { permissions?: string[]; role?: string; role_normalized?: string } | null | undefined, code: string) {
  if (!user) return false;
  if ((user.role_normalized || user.role) === 'super_admin') return true;
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
