import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBrand } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import { prefetchDashboard, prefetchContacts } from '@/lib/prefetchRecipes';

/**
 * Prefetches the most-visited data once after login + brand selection.
 * Runs only once per session. Recipes shared with usePrefetchOnHover.
 */
export function usePrefetchOnLogin() {
  const queryClient = useQueryClient();
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();
  const { user } = useAuth();
  const hasPrefetched = useRef(false);

  useEffect(() => {
    if (!user || !currentBrand || hasPrefetched.current) return;
    hasPrefetched.current = true;

    const brandIds = isAllBrandsSelected ? allBrandIds : [currentBrand.id];
    if (brandIds.length === 0) return;
    const brandKey = isAllBrandsSelected ? 'all' : currentBrand.id;

    prefetchDashboard(queryClient, { brandIds, isAllBrandsSelected, brandKey });
    prefetchContacts(queryClient, { brandIds, isAllBrandsSelected, brandKey });
  }, [user, currentBrand, isAllBrandsSelected, allBrandIds, queryClient]);
}
