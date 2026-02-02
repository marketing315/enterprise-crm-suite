import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Brand } from '@/types/database';

// System brand ID for company-wide aggregation (matches DB record with is_system=true)
export const SYSTEM_BRAND_ID = '00000000-0000-0000-0000-000000000000';

// Keep legacy constant for backward compatibility during transition
export const ALL_BRANDS_ID = SYSTEM_BRAND_ID;

interface BrandContextType {
  brands: Brand[];
  currentBrand: Brand | null;
  systemBrand: Brand | null; // The actual system brand from DB
  setCurrentBrand: (brand: Brand | null) => void;
  isLoading: boolean;
  hasBrandSelected: boolean;
  isAllBrandsSelected: boolean;
  allBrandIds: string[];
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

const BRAND_STORAGE_KEY = 'crm_selected_brand_id';

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { user, userRoles, isLoading: authLoading, isAdmin, isCeo } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [systemBrand, setSystemBrand] = useState<Brand | null>(null);
  const [currentBrandState, setCurrentBrandState] = useState<Brand | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch brands user has access to
  // RLS now handles visibility: admins see ALL brands, others see only their assigned brands
  useEffect(() => {
    const fetchBrands = async () => {
      if (!user || authLoading) {
        setBrands([]);
        setSystemBrand(null);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('brands')
          .select('*')
          .order('name');

        if (error) {
          console.error('Error fetching brands:', error);
          setBrands([]);
          setSystemBrand(null);
        } else {
          const allBrands = (data || []) as Brand[];
          
          // Separate system brand from regular brands
          const system = allBrands.find(b => b.id === SYSTEM_BRAND_ID || b.is_system === true);
          const regularBrands = allBrands.filter(b => b.id !== SYSTEM_BRAND_ID && b.is_system !== true);
          
          setSystemBrand(system || null);
          setBrands(regularBrands);
          
          // Try to restore previously selected brand
          const storedBrandId = localStorage.getItem(BRAND_STORAGE_KEY);
          if (storedBrandId && data) {
            if (storedBrandId === SYSTEM_BRAND_ID && system && (isAdmin || isCeo)) {
              setCurrentBrandState(system);
            } else {
              const storedBrand = regularBrands.find(b => b.id === storedBrandId);
              if (storedBrand) {
                setCurrentBrandState(storedBrand);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error in fetchBrands:', error);
        setBrands([]);
        setSystemBrand(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBrands();
  }, [user, userRoles, authLoading, isAdmin, isCeo]);

  const setCurrentBrand = (brand: Brand | null) => {
    setCurrentBrandState(brand);
    if (brand) {
      localStorage.setItem(BRAND_STORAGE_KEY, brand.id);
    } else {
      localStorage.removeItem(BRAND_STORAGE_KEY);
    }
  };

  const isAllBrandsSelected = currentBrandState?.id === SYSTEM_BRAND_ID || currentBrandState?.is_system === true;
  const allBrandIds = brands.map(b => b.id);

  return (
    <BrandContext.Provider
      value={{
        brands,
        currentBrand: currentBrandState,
        systemBrand,
        setCurrentBrand,
        isLoading: isLoading || authLoading,
        hasBrandSelected: currentBrandState !== null,
        isAllBrandsSelected,
        allBrandIds,
      }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const context = useContext(BrandContext);
  if (context === undefined) {
    throw new Error('useBrand must be used within a BrandProvider');
  }
  return context;
}

// Hook that throws if no brand is selected (for use in brand-required views)
export function useCurrentBrand(): Brand {
  const { currentBrand } = useBrand();
  if (!currentBrand) {
    throw new Error('No brand selected. This component requires a brand to be selected.');
  }
  return currentBrand;
}
