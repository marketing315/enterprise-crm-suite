import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { Loader2 } from 'lucide-react';
import { PendingApprovalScreen } from './PendingApprovalScreen';
import { SuspendedScreen } from './SuspendedScreen';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireBrand?: boolean;
}

export function ProtectedRoute({ children, requireBrand = false }: ProtectedRouteProps) {
  const { session, user, isLoading } = useAuth();
  const { currentBrand, isLoading: brandLoading } = useBrand();
  const location = useLocation();

  if (isLoading || (requireBrand && brandLoading)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Fase 3 — RBAC Modello 3 (open + pending)
  // Block any protected route when user is not yet active.
  if (user?.status === 'suspended') {
    return <SuspendedScreen />;
  }
  if (user && user.status !== 'active') {
    return <PendingApprovalScreen />;
  }

  // Enforce requireBrand — redirect to brand selection if no brand chosen
  if (requireBrand && !currentBrand) {
    return <Navigate to="/select-brand" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

