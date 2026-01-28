import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Brand } from '@/types/database';

// Special constant for "All Brands" virtual brand
export const ALL_BRANDS_ID = '__ALL_BRANDS__';

export const ALL_BRANDS: Brand = {
  id: ALL_BRANDS_ID,
  name: 'Tutti i brand',
  slug: 'all-brands',
  auto_assign_enabled: false,
  sla_thresholds_minutes: { "1": 60, "2": 120, "3": 240, "4": 480, "5": 1440 },
  created_at: '',
  updated_at: '',
};

interface BrandContextType {
  brands: Brand[];
  currentBrand: Brand | null;
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
  const [currentBrandState, setCurrentBrandState] = useState<Brand | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch brands user has access to
  // RLS now handles visibility: admins see ALL brands, others see only their assigned brands
  useEffect(() => {
    const fetchBrands = async () => {
      if (!user || authLoading) {
        setBrands([]);
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
        } else {
          setBrands((data || []) as Brand[]);
          
          // Try to restore previously selected brand
          const storedBrandId = localStorage.getItem(BRAND_STORAGE_KEY);
          if (storedBrandId && data) {
            if (storedBrandId === ALL_BRANDS_ID && (isAdmin || isCeo)) {
              setCurrentBrandState(ALL_BRANDS);
            } else {
              const storedBrand = data.find(b => b.id === storedBrandId);
              if (storedBrand) {
                setCurrentBrandState(storedBrand as Brand);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error in fetchBrands:', error);
        setBrands([]);
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

  const isAllBrandsSelected = currentBrandState?.id === ALL_BRANDS_ID;
  const allBrandIds = brands.map(b => b.id);

  return (
    <BrandContext.Provider
      value={{
        brands,
        currentBrand: currentBrandState,
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
