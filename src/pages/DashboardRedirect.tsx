import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBrand } from '@/contexts/BrandContext';
import { useRoleDashboard } from '@/hooks/useRoleDashboard';
import { Loader2 } from 'lucide-react';

/**
 * /dashboard entry-point: redirects to the role-specific dashboard.
 * Falls back to /dashboard/overview if no role matches.
 */
export default function DashboardRedirect() {
  const { hasBrandSelected, isLoading: brandLoading } = useBrand();
  const { primaryPath } = useRoleDashboard();
  const navigate = useNavigate();

  useEffect(() => {
    if (brandLoading) return;

    if (!hasBrandSelected) {
      navigate('/select-brand', { replace: true });
      return;
    }

    navigate(primaryPath, { replace: true });
  }, [brandLoading, hasBrandSelected, primaryPath, navigate]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
