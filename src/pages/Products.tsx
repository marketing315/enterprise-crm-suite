import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { 
  Package, 
  Plus, 
  Search,
  Pencil,
  MoreHorizontal,
  ShieldAlert
} from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/useProducts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Product } from "@/types/sales";

export default function Products() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const { isAdmin, isCeo } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    sku: "",
    default_price: "",
    vat_rate: "22",
  });

  // Check permissions - only admin/ceo can manage products
  const canManage = isAdmin || isCeo;

  const { data: products = [], isLoading } = useProducts({ activeOnly: !showInactive });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>
            Seleziona un brand dalla sidebar per visualizzare i prodotti.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Accesso negato</AlertTitle>
          <AlertDescription>
            Solo gli amministratori possono gestire il catalogo prodotti.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const filteredProducts = products.filter(product => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      product.name.toLowerCase().includes(query) ||
      product.sku?.toLowerCase().includes(query) ||
      product.description?.toLowerCase().includes(query)
    );
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      sku: "",
      default_price: "",
      vat_rate: "22",
    });
    setEditingProduct(null);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || "",
      sku: product.sku || "",
      default_price: product.default_price.toString(),
      vat_rate: (product.vat_rate ?? 22).toString(),
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

    if (editingProduct) {
      await updateProduct.mutateAsync({ productId: editingProduct.id, data });
    } else {
      await createProduct.mutateAsync(data);
    }

    setDialogOpen(false);
    resetForm();
  };

  const handleDelete = async (productId: string) => {
    await deleteProduct.mutateAsync(productId);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Catalogo Prodotti
          </h1>
          <p className="text-muted-foreground">
            Gestisci prodotti e servizi vendibili
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nuovo prodotto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingProduct ? "Modifica prodotto" : "Nuovo prodotto"}
              </DialogTitle>
              <DialogDescription>
                {editingProduct 
                  ? "Modifica i dettagli del prodotto"
                  : "Aggiungi un nuovo prodotto al catalogo"
                }
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nome del prodotto"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrizione</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrizione opzionale"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                    placeholder="Codice articolo"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default_price">Prezzo (€) *</Label>
                  <Input
                    id="default_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.default_price}
                    onChange={(e) => setFormData(prev => ({ ...prev, default_price: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vat_rate">IVA (%)</Label>
                <Input
                  id="vat_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.vat_rate}
                  onChange={(e) => setFormData(prev => ({ ...prev, vat_rate: e.target.value }))}
                  placeholder="22"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={!formData.name || !formData.default_price || createProduct.isPending || updateProduct.isPending}
              >
                {editingProduct ? "Salva modifiche" : "Crea prodotto"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome o SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant={showInactive ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowInactive(!showInactive)}
        >
          {showInactive ? "Nascondi inattivi" : "Mostra inattivi"}
        </Button>
      </div>

      {/* Products Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Prezzo</TableHead>
              <TableHead>IVA</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Caricamento...
                </TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nessun prodotto trovato
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{product.name}</div>
                      {product.description && (
                        <div className="text-sm text-muted-foreground truncate max-w-xs">
                          {product.description}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.sku || "-"}
                  </TableCell>
                  <TableCell>{formatCurrency(product.default_price)}</TableCell>
                  <TableCell>{product.vat_rate ?? 22}%</TableCell>
                  <TableCell>
                    <Badge variant={product.is_active ? "default" : "secondary"}>
                      {product.is_active ? "Attivo" : "Inattivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Altre azioni">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(product)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Modifica
                        </DropdownMenuItem>
                        {product.is_active && (
                          <DropdownMenuItem 
                            onClick={() => handleDelete(product.id)}
                            className="text-destructive"
                          >
                            Disattiva
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
