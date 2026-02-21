import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireBrand?: boolean;
}

export function ProtectedRoute({ children, requireBrand = false }: ProtectedRouteProps) {
  const { session, isLoading } = useAuth();
  const { currentBrand, isLoading: brandLoading } = useBrand();
  const location = useLocation();

  if (isLoading || (requireBrand && brandLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // B1 FIX: Enforce requireBrand — redirect to brand selection if no brand chosen
  if (requireBrand && !currentBrand) {
    return <Navigate to="/select-brand" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
