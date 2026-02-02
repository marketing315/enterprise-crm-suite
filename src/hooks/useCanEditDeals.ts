import { useAuth } from '@/contexts/AuthContext';
import { useBrand } from '@/contexts/BrandContext';

/**
 * Hook to check if the current user can edit deals in the pipeline.
 * Returns false for users with 'amministrazione' role (read-only access).
 */
export function useCanEditDeals(): boolean {
  const { hasRole } = useAuth();
  const { currentBrand } = useBrand();
  
  // If no brand selected, cannot edit
  if (!currentBrand) return false;
  
  // Amministrazione role is read-only
  const isAmministrazione = hasRole('amministrazione', currentBrand.id);
  
  // Amministrazione cannot edit deals
  if (isAmministrazione) return false;
  
  // All other roles that can view deals can also edit them
  return true;
}
