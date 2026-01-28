import { forwardRef } from 'react';
import { useBrand, ALL_BRANDS, ALL_BRANDS_ID } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Building2, Globe } from 'lucide-react';

interface BrandSelectorProps {
  compact?: boolean;
}

export const BrandSelector = forwardRef<HTMLDivElement, BrandSelectorProps>(
  function BrandSelector({ compact = false }, ref) {
    const { brands, currentBrand, setCurrentBrand, isLoading } = useBrand();
    const { isAdmin, isCeo } = useAuth();

    const canSeeAllBrands = isAdmin || isCeo;

    if (isLoading) {
      return (
        <div ref={ref} className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="text-sm">Caricamento...</span>
        </div>
      );
    }

    if (brands.length === 0) {
      return (
        <div ref={ref} className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="text-sm">Nessun brand disponibile</span>
        </div>
      );
    }

    return (
      <div ref={ref} className={compact ? '' : 'flex items-center gap-2'}>
        {!compact && <Building2 className="h-4 w-4 text-muted-foreground" />}
        <Select
          value={currentBrand?.id || ''}
          onValueChange={(value) => {
            if (value === ALL_BRANDS_ID) {
              setCurrentBrand(ALL_BRANDS);
            } else {
              const brand = brands.find(b => b.id === value);
              setCurrentBrand(brand || null);
            }
          }}
        >
          <SelectTrigger className={compact ? 'w-full' : 'w-[200px]'}>
            <SelectValue placeholder="Seleziona brand" />
          </SelectTrigger>
          <SelectContent>
            {/* All Brands option for admins/CEOs */}
            {canSeeAllBrands && (
              <SelectItem value={ALL_BRANDS_ID} className="font-medium">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span>Tutti i brand</span>
                </div>
              </SelectItem>
            )}
            {/* Individual brands */}
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
);

BrandSelector.displayName = "BrandSelector";
