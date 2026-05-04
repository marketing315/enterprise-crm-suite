import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBrand } from '@/contexts/BrandContext';
import { prefetchForRoute } from '@/lib/prefetchRecipes';

const HOVER_DEBOUNCE_MS = 80;

/**
 * Debounced hover/focus prefetch for navigation links.
 * Returns handlers to attach to a link/button.
 */
export function usePrefetchOnHover(path: string) {
  const queryClient = useQueryClient();
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const brandIds = isAllBrandsSelected ? allBrandIds : currentBrand ? [currentBrand.id] : [];
      const brandKey = isAllBrandsSelected ? 'all' : currentBrand?.id ?? '';
      if (!brandKey) return;
      prefetchForRoute(path, queryClient, { brandIds, isAllBrandsSelected, brandKey });
    }, HOVER_DEBOUNCE_MS);
  }, [path, queryClient, currentBrand, isAllBrandsSelected, allBrandIds]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return { onMouseEnter: trigger, onFocus: trigger, onMouseLeave: cancel, onBlur: cancel };
}
