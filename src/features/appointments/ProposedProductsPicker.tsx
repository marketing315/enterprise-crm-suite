/**
 * ProposedProductsPicker — multi-select catalog with editable proposed price.
 */
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useProducts } from "@/hooks/useProducts";

export interface ProposedItem {
  product_id: string;
  name: string;
  vat_rate: number | null;
  proposed_price: number;
}

interface Props {
  value: ProposedItem[];
  onChange: (items: ProposedItem[]) => void;
}

export function ProposedProductsPicker({ value, onChange }: Props) {
  const { data: products = [], isLoading } = useProducts({ activeOnly: true });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const byId = useMemo(() => {
    const map = new Map<string, ProposedItem>();
    value.forEach((it) => map.set(it.product_id, it));
    return map;
  }, [value]);

  const toggle = (productId: string, checked: boolean) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    if (checked) {
      const next: ProposedItem = {
        product_id: product.id,
        name: product.name,
        vat_rate: product.vat_rate,
        proposed_price: Number(product.default_price ?? 0),
      };
      onChange([...value, next]);
    } else {
      onChange(value.filter((it) => it.product_id !== productId));
    }
  };

  const updatePrice = (productId: string, price: number) => {
    onChange(value.map((it) => (it.product_id === productId ? { ...it, proposed_price: price } : it)));
  };

  return (
    <div className="space-y-3">
      <Input
        placeholder="Cerca prodotto o SKU…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Nessun prodotto trovato</p>
      ) : (
        <div className="max-h-[320px] overflow-auto space-y-1.5 pr-1">
          {filtered.map((p) => {
            const selected = byId.get(p.id);
            return (
              <div
                key={p.id}
                className="rounded-md border border-border bg-card p-3 space-y-2"
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    className="mt-0.5"
                    checked={!!selected}
                    onCheckedChange={(c) => toggle(p.id, Boolean(c))}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.sku ? `${p.sku} · ` : ""}Riferimento € {Number(p.default_price).toFixed(2)}
                    </p>
                  </div>
                </label>
                {selected && (
                  <div className="pl-7 flex items-center gap-2">
                    <Label htmlFor={`price-${p.id}`} className="text-xs text-muted-foreground">
                      Prezzo proposto (€)
                    </Label>
                    <Input
                      id={`price-${p.id}`}
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-8 w-32"
                      value={selected.proposed_price}
                      onChange={(e) => updatePrice(p.id, Number(e.target.value))}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
