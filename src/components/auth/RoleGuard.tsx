import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import type { AppRole } from '@/types/database';

interface RoleGuardProps {
  /** At least one of these roles is required to access the route */
  allowedRoles: AppRole[];
  children: React.ReactNode;
  /** Where to redirect if access is denied (default: /dashboard) */
  fallback?: string;
}

/**
 * Blocks access to a route unless the user holds at least one of the
 * allowed roles (global or brand-scoped). Works alongside ProtectedRoute
 * which handles authentication; this component handles **authorization**.
 */
export function RoleGuard({ allowedRoles, children, fallback = '/dashboard' }: RoleGuardProps) {
  const { hasRole, isAdmin, isCeo, isLoading } = useAuth();
  const { currentBrand } = useBrand();

  // Wait for auth to finish loading before making access decisions
  if (isLoading) return null;

  const hasAccess = allowedRoles.some((role) => {
    if (role === 'admin') return isAdmin;
    if (role === 'ceo') return isCeo;
    // Check both global and brand-scoped roles
    return hasRole(role) || (currentBrand && hasRole(role, currentBrand.id));
  });

  if (!hasAccess) {
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}
