import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/integrations/supabase/client';
import type { Brand } from '@/types/database';

interface BrandContextType {
  brands: Brand[];
  currentBrand: Brand | null;
  setCurrentBrand: (brand: Brand | null) => void;
  isLoading: boolean;
  hasBrandSelected: boolean;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

const BRAND_STORAGE_KEY = 'crm_selected_brand_id';

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { user, userRoles, isLoading: authLoading } = useAuth();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [currentBrand, setCurrentBrandState] = useState<Brand | null>(null);
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
            const storedBrand = data.find(b => b.id === storedBrandId);
            if (storedBrand) {
              setCurrentBrandState(storedBrand as Brand);
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
  }, [user, userRoles, authLoading]);

  const setCurrentBrand = (brand: Brand | null) => {
    setCurrentBrandState(brand);
    if (brand) {
      localStorage.setItem(BRAND_STORAGE_KEY, brand.id);
    } else {
      localStorage.removeItem(BRAND_STORAGE_KEY);
    }
  };

  return (
    <BrandContext.Provider
      value={{
        brands,
        currentBrand,
        setCurrentBrand,
        isLoading: isLoading || authLoading,
        hasBrandSelected: currentBrand !== null
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
