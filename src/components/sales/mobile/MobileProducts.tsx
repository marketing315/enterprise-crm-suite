/**
 * F5.4 — Mobile Products (/products)
 * Lista catalogo prodotti mobile-first. Riusa hook+dialog desktop esistenti.
 */
import { useState } from "react";
import { Package, Plus, ShieldAlert, Pencil } from "lucide-react";

import {
  EmptyState,
  ErrorState,
  MobileListSkeleton,
  PullToRefresh,
} from "@/components/mobile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from "@/hooks/useProducts";
import { useQueryClient } from "@tanstack/react-query";
import type { Product } from "@/types/sales";
import { cn } from "@/lib/utils";

function fmtEur(n: number): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);
}

function MobileProducts() {
  const queryClient = useQueryClient();
  const { hasBrandSelected } = useBrand();
  const { isAdmin, isCeo } = useAuth();
  const canManage = isAdmin || isCeo;

  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    sku: "",
    default_price: "",
    vat_rate: "22",
  });

  const productsQ = useProducts({ activeOnly: !showInactive });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  if (!hasBrandSelected) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          icon={Package}
          title="Nessun brand selezionato"
          description="Seleziona un brand dalla barra in alto per vedere i prodotti."
        />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          icon={ShieldAlert}
          title="Accesso negato"
          description="Solo amministratori e CEO possono gestire il catalogo prodotti."
        />
      </div>
    );
  }

  const products = productsQ.data ?? [];
  const filtered = products.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  });

  const resetForm = () => {
    setFormData({ name: "", description: "", sku: "", default_price: "", vat_rate: "22" });
    setEditing(null);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setFormData({
      name: p.name,
      description: p.description || "",
      sku: p.sku || "",
      default_price: p.default_price.toString(),
      vat_rate: (p.vat_rate ?? 22).toString(),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const data = {
      name: formData.name,
      description: formData.description || undefined,
      sku: formData.sku || undefined,
      default_price: parseFloat(formData.default_price) || 0,
      vat_rate: parseFloat(formData.vat_rate) || 22,
    };
    if (editing) {
      await updateProduct.mutateAsync({ productId: editing.id, data });
    } else {
      await createProduct.mutateAsync(data);
    }
    setDialogOpen(false);
    resetForm();
  };

  return (
    <>
      <PullToRefresh onRefresh={handleRefresh}>
        <div className="flex flex-col gap-4 pb-24">
          {/* Header */}
          <header className="sticky top-0 z-20 -mt-3 border-b border-border/40 bg-background/85 px-4 pb-3 pt-3 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                  <Package className="h-5 w-5" /> Catalogo
                </h1>
                <p className="truncate text-xs text-muted-foreground">
                  {filtered.length} prodotti{showInactive ? " (incl. inattivi)" : ""}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  resetForm();
                  setDialogOpen(true);
                }}
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                <span className="text-xs">Nuovo</span>
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              <Input
                placeholder="Cerca per nome o SKU…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Cerca prodotti"
              />
              <Button
                size="sm"
                variant={showInactive ? "secondary" : "outline"}
                onClick={() => setShowInactive((v) => !v)}
                className="w-full"
              >
                {showInactive ? "Nascondi inattivi" : "Mostra anche inattivi"}
              </Button>
            </div>
          </header>

          <section className="space-y-2 px-4" aria-label="Prodotti">
            {productsQ.isError ? (
              <ErrorState
                title="Errore caricamento prodotti"
                description={
                  productsQ.error instanceof Error ? productsQ.error.message : undefined
                }
                onRetry={() => void productsQ.refetch()}
              />
            ) : productsQ.isLoading ? (
              <MobileListSkeleton count={6} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Nessun prodotto"
                description="Aggiungi il primo prodotto al catalogo."
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      resetForm();
                      setDialogOpen(true);
                    }}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" /> Nuovo prodotto
                  </Button>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2" aria-label={`${filtered.length} prodotti`}>
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className={cn(
                        "press-scale flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 text-left shadow-card",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          {!p.is_active && (
                            <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                              Inattivo
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.sku ? `SKU ${p.sku} · ` : ""}IVA {p.vat_rate ?? 22}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          {fmtEur(p.default_price)}
                        </p>
                        <Pencil className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </PullToRefresh>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica prodotto" : "Nuovo prodotto"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifica i dettagli del prodotto"
                : "Aggiungi un nuovo prodotto al catalogo"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="m-name">Nome *</Label>
              <Input
                id="m-name"
                value={formData.name}
                onChange={(e) => setFormData((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-desc">Descrizione</Label>
              <Textarea
                id="m-desc"
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData((s) => ({ ...s, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="m-sku">SKU</Label>
                <Input
                  id="m-sku"
                  value={formData.sku}
                  onChange={(e) => setFormData((s) => ({ ...s, sku: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m-price">Prezzo (€) *</Label>
                <Input
                  id="m-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.default_price}
                  onChange={(e) => setFormData((s) => ({ ...s, default_price: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-vat">IVA (%)</Label>
              <Input
                id="m-vat"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.vat_rate}
                onChange={(e) => setFormData((s) => ({ ...s, vat_rate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {editing && editing.is_active && (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  await deleteProduct.mutateAsync(editing.id);
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                Disattiva
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.name ||
                !formData.default_price ||
                createProduct.isPending ||
                updateProduct.isPending
              }
            >
              {editing ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default MobileProducts;
export { MobileProducts };
