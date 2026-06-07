export const ADMIN_TOKEN_HELP = 'Set LAJOO_ADMIN_TOKEN and pass it in the x-lajoo-admin-token header.';

export function isAdminAuthorized(request) {
  const expectedToken = process.env.LAJOO_ADMIN_TOKEN;
  if (!expectedToken && process.env.NODE_ENV !== 'production') return true;
  if (!expectedToken) return false;

  const headerToken = request.headers.get('x-lajoo-admin-token') || '';
  const bearer = request.headers.get('authorization') || '';
  const bearerToken = bearer.toLowerCase().startsWith('bearer ')
    ? bearer.slice(7)
    : '';
  return headerToken === expectedToken || bearerToken === expectedToken;
}

export function buildAdminUnauthorizedPayload() {
  return {
    error: 'Admin token required.',
    help: ADMIN_TOKEN_HELP,
  };
}
