import { forwardRef, useState } from 'react';
import { useBrand, SYSTEM_BRAND_ID } from '@/contexts/BrandContext';
import { useAuth } from '@/contexts/AuthContext';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Globe, Plus } from 'lucide-react';
import { toast } from 'sonner';

const CREATE_BRAND_VALUE = '__create_brand__';

interface BrandSelectorProps {
  compact?: boolean;
}

export const BrandSelector = forwardRef<HTMLDivElement, BrandSelectorProps>(
  function BrandSelector({ compact = false }, ref) {
    const { brands, currentBrand, systemBrand, setCurrentBrand, refetchBrands, isLoading } = useBrand();
    const { isAdmin, isCeo, hasRole } = useAuth();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [newBrandName, setNewBrandName] = useState('');
    const [newBrandSlug, setNewBrandSlug] = useState('');

    const isAmministrazione = currentBrand ? hasRole('amministrazione', currentBrand.id) : false;
    const canSeeAllBrands = isAdmin || isCeo || isAmministrazione;

    const createBrandMutation = useMutation({
      mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
        const { data, error } = await supabase
          .from('brands')
          .insert({ name, slug })
          .select()
          .single();
        if (error) throw error;
        return data;
      },
      onSuccess: (data) => {
        toast.success('Brand creato con successo');
        setDialogOpen(false);
        setNewBrandName('');
        setNewBrandSlug('');
        queryClient.invalidateQueries({ queryKey: ['brands'] });
        // Auto-select the new brand
        if (data) {
          setCurrentBrand(data as any);
        }
      },
      onError: (error: Error) => {
        toast.error(`Errore: ${error.message}`);
      },
    });

    const handleCreate = () => {
      if (!newBrandName.trim() || !newBrandSlug.trim()) {
        toast.error('Compila tutti i campi');
        return;
      }
      createBrandMutation.mutate({ name: newBrandName, slug: newBrandSlug });
    };

    if (isLoading) {
      return (
        <div ref={ref} className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="text-sm">Caricamento...</span>
        </div>
      );
    }

    if (brands.length === 0 && !systemBrand && !isAdmin) {
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
            if (value === CREATE_BRAND_VALUE) {
              setDialogOpen(true);
              return;
            }
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
            {canSeeAllBrands && systemBrand && (
              <SelectItem value={systemBrand.id} className="font-medium">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <span>{systemBrand.name}</span>
                </div>
              </SelectItem>
            )}
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
            {isAdmin && (
              <>
                <SelectSeparator />
                <SelectItem value={CREATE_BRAND_VALUE} className="text-primary">
                  <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    <span>Aggiungi Brand</span>
                  </div>
                </SelectItem>
              </>
            )}
          </SelectContent>
        </Select>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crea Nuovo Brand</DialogTitle>
              <DialogDescription>Inserisci i dettagli del nuovo brand</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-brand-name">Nome Brand</Label>
                <Input
                  id="new-brand-name"
                  value={newBrandName}
                  onChange={(e) => {
                    setNewBrandName(e.target.value);
                    setNewBrandSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
                  }}
                  placeholder="Es. Acme Corp"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-brand-slug">Slug</Label>
                <Input
                  id="new-brand-slug"
                  value={newBrandSlug}
                  onChange={(e) => setNewBrandSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="es. acme-corp"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
              <Button onClick={handleCreate} disabled={createBrandMutation.isPending}>
                {createBrandMutation.isPending ? 'Creazione...' : 'Crea Brand'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

BrandSelector.displayName = "BrandSelector";
