import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";

/**
 * Check if current user has marketing read access
 * Roles: admin, ceo, amministrazione, responsabile_venditori, responsabile_callcenter
 */
export function useHasMarketingAccess(): boolean {
  const { isAdmin, isCeo, hasRole } = useAuth();
  const { currentBrand } = useBrand();

  if (isAdmin || isCeo) return true;
  if (!currentBrand) return false;

  return (
    hasRole("amministrazione", currentBrand.id) ||
    hasRole("responsabile_venditori", currentBrand.id) ||
    hasRole("responsabile_callcenter", currentBrand.id)
  );
}

/**
 * Check if current user can create/edit campaigns and channels
 * Roles: admin, ceo only
 */
export function useCanEditCampaigns(): boolean {
  const { isAdmin, isCeo } = useAuth();
  return isAdmin || isCeo;
}

/**
 * Check if current user can create/edit marketing costs
 * Roles: admin, ceo, amministrazione
 */
export function useCanEditMarketingCosts(): boolean {
  const { isAdmin, isCeo, hasRole } = useAuth();
  const { currentBrand } = useBrand();

  if (isAdmin || isCeo) return true;
  if (!currentBrand) return false;

  return hasRole("amministrazione", currentBrand.id);
}
