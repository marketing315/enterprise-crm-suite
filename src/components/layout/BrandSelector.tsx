import { forwardRef } from 'react';
import { useBrand, SYSTEM_BRAND_ID } from '@/contexts/BrandContext';
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
    const { brands, currentBrand, systemBrand, setCurrentBrand, isLoading } = useBrand();
    const { isAdmin, isCeo, hasRole } = useAuth();

    // Admin, CEO, and Amministrazione can see "Azienda Intera" option
    const isAmministrazione = currentBrand ? hasRole('amministrazione', currentBrand.id) : false;
    const canSeeAllBrands = isAdmin || isCeo || isAmministrazione;

    if (isLoading) {
      return (
        <div ref={ref} className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="text-sm">Caricamento...</span>
        </div>
      );
    }

    if (brands.length === 0 && !systemBrand) {
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
            if (value === SYSTEM_BRAND_ID && systemBrand) {
              setCurrentBrand(systemBrand);
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
            {/* System brand option for admins/CEOs/amministrazione */}
            {canSeeAllBrands && systemBrand && (
              <SelectItem value={systemBrand.id} className="font-medium">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span>{systemBrand.name}</span>
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
