import { useBrand, ALL_BRANDS_ID } from '@/contexts/BrandContext';

/**
 * Hook that provides brand filtering utilities for queries.
 * When "All Brands" is selected, returns all brand IDs for filtering.
 */
export function useBrandFilter() {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  /**
   * Get the brand ID(s) to filter by.
   * Returns single ID for specific brand, or all IDs for "All Brands".
   */
  const getBrandIds = (): string[] => {
    if (isAllBrandsSelected) {
      return allBrandIds;
    }
    return currentBrand?.id ? [currentBrand.id] : [];
  };

  /**
   * Get query key suffix for React Query.
   * Ensures proper cache invalidation when brand changes.
   */
  const getQueryKeyBrand = (): string => {
    if (isAllBrandsSelected) {
      return ALL_BRANDS_ID;
    }
    return currentBrand?.id || '';
  };

  /**
   * Check if queries should be enabled.
   */
  const isQueryEnabled = (): boolean => {
    return isAllBrandsSelected ? allBrandIds.length > 0 : !!currentBrand?.id;
  };

  return {
    currentBrand,
    isAllBrandsSelected,
    allBrandIds,
    getBrandIds,
    getQueryKeyBrand,
    isQueryEnabled,
  };
}
