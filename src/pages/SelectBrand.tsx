import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useBrand, ALL_BRANDS } from '@/contexts/BrandContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, ArrowRight, Loader2, Globe } from 'lucide-react';

export default function SelectBrand() {
  const { user, isLoading: authLoading, signOut, isAdmin, isCeo } = useAuth();
  const { brands, currentBrand, setCurrentBrand, isLoading: brandLoading } = useBrand();
  const navigate = useNavigate();

  const canSeeAllBrands = isAdmin || isCeo;

  useEffect(() => {
    // If already has a brand selected, go to dashboard
    if (currentBrand && !brandLoading) {
      navigate('/dashboard');
    }
  }, [currentBrand, brandLoading, navigate]);

  const handleSelectBrand = (brand: typeof brands[0]) => {
    setCurrentBrand(brand);
    navigate('/dashboard');
  };

  const handleSelectAllBrands = () => {
    setCurrentBrand(ALL_BRANDS);
    navigate('/dashboard');
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  if (authLoading || brandLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="h-10 w-10 text-primary" />
          <h1 className="text-3xl font-bold">CRM Enterprise</h1>
        </div>
        <p className="text-muted-foreground">Benvenuto, {user?.full_name || user?.email}</p>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Seleziona Brand</CardTitle>
          <CardDescription>
            Scegli il brand con cui vuoi lavorare
          </CardDescription>
        </CardHeader>
        <CardContent>
          {brands.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                Non hai accesso a nessun brand.<br />
                Contatta un amministratore per ottenere l'accesso.
              </p>
              <Button variant="outline" onClick={handleLogout}>
                Esci
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* All Brands option for admins/CEOs */}
              {canSeeAllBrands && (
                <Button
                  variant="default"
                  className="w-full justify-between h-auto py-4"
                  onClick={handleSelectAllBrands}
                >
                  <div className="flex items-center gap-3">
                    <Globe className="h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">Tutti i brand</div>
                      <div className="text-xs opacity-80">Vista globale aggregata</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
              
              {/* Individual brands */}
              {brands.map((brand) => (
                <Button
                  key={brand.id}
                  variant="outline"
                  className="w-full justify-between h-auto py-4"
                  onClick={() => handleSelectBrand(brand)}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-primary" />
                    <div className="text-left">
                      <div className="font-medium">{brand.name}</div>
                      <div className="text-xs text-muted-foreground">{brand.slug}</div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
