import { useBrand, SYSTEM_BRAND_ID } from "@/contexts/BrandContext";

/**
 * Returns the real brand_id for write operations.
 * Throws a clear error if the user is in "Azienda Intera" (global) view,
 * since creating entities under the system brand is not allowed.
 */
export function useWriteBrandId(): {
  /** Returns brand_id safe for INSERT. Throws if global view. */
  getWriteBrandId: () => string;
  /** True if current selection is global — creation is disabled */
  isGlobalView: boolean;
  /** The current brand (may be system brand) */
  currentBrand: ReturnType<typeof useBrand>["currentBrand"];
} {
  const { currentBrand, isAllBrandsSelected } = useBrand();

  const getWriteBrandId = (): string => {
    if (!currentBrand?.id) {
      throw new Error("Nessun brand selezionato");
    }
    if (isAllBrandsSelected || currentBrand.id === SYSTEM_BRAND_ID) {
      throw new Error(
        "Seleziona un brand specifico per creare nuovi elementi. La creazione non è consentita nella vista \"Azienda Intera\"."
      );
    }
    return currentBrand.id;
  };

  return {
    getWriteBrandId,
    isGlobalView: isAllBrandsSelected,
    currentBrand,
  };
}
