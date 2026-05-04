import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBrand } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRoleDashboard } from '@/hooks/useRoleDashboard';
import { useAdminSetupProgress, isStepComplete, SETUP_STEPS } from '@/hooks/useAdminSetupProgress';
import { Loader2 } from 'lucide-react';

/**
 * /dashboard entry-point: redirects to the role-specific dashboard.
 * For admins on first access (no setup steps done, not dismissed) → redirect to /setup.
 * Falls back to /dashboard/overview if no role matches.
 */
export default function DashboardRedirect() {
  const { hasBrandSelected, isLoading: brandLoading } = useBrand();
  const { isAdmin } = useAuth();
  const { primaryPath } = useRoleDashboard();
  const navigate = useNavigate();
  const { data: setup, isLoading: setupLoading } = useAdminSetupProgress();

  useEffect(() => {
    if (brandLoading) return;
    if (isAdmin && setupLoading) return;

    if (!hasBrandSelected) {
      navigate('/select-brand', { replace: true });
      return;
    }

    if (isAdmin && setup && !setup.manual.dismissed_at) {
      const completed = SETUP_STEPS.filter((s) => isStepComplete(setup, s)).length;
      if (completed === 0) {
        navigate('/setup', { replace: true });
        return;
      }
    }

    navigate(primaryPath, { replace: true });
  }, [brandLoading, hasBrandSelected, primaryPath, navigate, isAdmin, setup, setupLoading]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
