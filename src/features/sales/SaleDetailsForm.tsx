/**
 * SaleDetailsForm — sale finalization form: client recap, payment mode,
 * installment details, contracts upload. Computes totals from proposed items.
 */
import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContractUploader } from "./ContractUploader";
import type { ProposedItem } from "@/features/appointments/ProposedProductsPicker";
import type { PaymentMethod } from "@/types/sales";

export type PaymentMode =
  | "paid_delivered"
  | "deposit_balance"
  | "deposit_financing";

export interface ClientInfo {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export interface SaleDraft {
  client: ClientInfo;
  mode: PaymentMode;
  /** For paid_delivered + deposit_balance */
  paid_method: Extract<PaymentMethod, "cash" | "card" | "bank_transfer">;
  deposit_amount: number;
  /** For deposit_financing only */
  installments: {
    num_installments: number;
    installment_amount: number;
    first_due_date: string;
  };
  contract_paths: string[];
}

interface Props {
  items: ProposedItem[];
  /** Pseudo id used as upload folder prefix (a draft uuid). */
  draftOrderId: string;
  value: SaleDraft;
  onChange: (next: SaleDraft) => void;
}

export const DEFAULT_SALE_DRAFT = (client: ClientInfo): SaleDraft => ({
  client,
  mode: "paid_delivered",
  paid_method: "card",
  deposit_amount: 0,
  installments: {
    num_installments: 12,
    installment_amount: 0,
    first_due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  },
  contract_paths: [],
});

export function SaleDetailsForm({ items, draftOrderId, value, onChange }: Props) {
  const total = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.proposed_price) || 0), 0),
    [items]
  );

  const balance = Math.max(0, total - (Number(value.deposit_amount) || 0));

  const patch = (p: Partial<SaleDraft>) => onChange({ ...value, ...p });

  return (
    <div className="space-y-5">
      {/* Client recap */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Dati cliente</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="c-fn" className="text-xs">Nome</Label>
            <Input
              id="c-fn"
              value={value.client.first_name}
              onChange={(e) => patch({ client: { ...value.client, first_name: e.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="c-ln" className="text-xs">Cognome</Label>
            <Input
              id="c-ln"
              value={value.client.last_name}
              onChange={(e) => patch({ client: { ...value.client, last_name: e.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="c-ph" className="text-xs">Telefono</Label>
            <Input
              id="c-ph"
              value={value.client.phone}
              onChange={(e) => patch({ client: { ...value.client, phone: e.target.value } })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="c-em" className="text-xs">Email</Label>
            <Input
              id="c-em"
              type="email"
              value={value.client.email}
              onChange={(e) => patch({ client: { ...value.client, email: e.target.value } })}
            />
          </div>
        </div>
      </section>

      {/* Total */}
      <section className="rounded-md border border-border bg-muted/30 p-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Totale vendita</span>
        <span className="text-lg font-semibold">€ {total.toFixed(2)}</span>
      </section>

      {/* Payment mode */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Modalità pagamento / consegna</h3>
        <RadioGroup
          value={value.mode}
          onValueChange={(v) => patch({ mode: v as PaymentMode })}
          className="grid grid-cols-1 gap-1.5"
        >
          {[
            { id: "paid_delivered", label: "Pagato e consegnato" },
            { id: "deposit_balance", label: "Acconto con saldo alla consegna" },
            { id: "deposit_financing", label: "Acconto e finanziamento" },
          ].map((opt) => (
            <label
              key={opt.id}
              htmlFor={`mode-${opt.id}`}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-accent/40"
            >
              <RadioGroupItem id={`mode-${opt.id}`} value={opt.id} />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </RadioGroup>
      </section>

      {/* Mode-specific fields */}
      {value.mode === "paid_delivered" && (
        <section className="space-y-2">
          <Label className="text-xs">Metodo di pagamento</Label>
          <Select
            value={value.paid_method}
            onValueChange={(v) => patch({ paid_method: v as SaleDraft["paid_method"] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="card">Carta</SelectItem>
              <SelectItem value="cash">Contanti</SelectItem>
              <SelectItem value="bank_transfer">Bonifico</SelectItem>
            </SelectContent>
          </Select>
        </section>
      )}

      {value.mode === "deposit_balance" && (
        <section className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="dep" className="text-xs">Acconto (€)</Label>
              <Input
                id="dep"
                type="number"
                min={0}
                step="0.01"
                value={value.deposit_amount}
                onChange={(e) => patch({ deposit_amount: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Saldo alla consegna (€)</Label>
              <Input value={balance.toFixed(2)} readOnly className="bg-muted/40" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Metodo acconto</Label>
            <Select
              value={value.paid_method}
              onValueChange={(v) => patch({ paid_method: v as SaleDraft["paid_method"] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Contanti</SelectItem>
                <SelectItem value="bank_transfer">Bonifico</SelectItem>
                <SelectItem value="card">Carta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>
      )}

      {value.mode === "deposit_financing" && (
        <section className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="fin-dep" className="text-xs">Acconto (€)</Label>
            <Input
              id="fin-dep"
              type="number"
              min={0}
              step="0.01"
              value={value.deposit_amount}
              onChange={(e) => patch({ deposit_amount: Number(e.target.value) })}
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">N° rate</Label>
              <Input
                type="number"
                min={1}
                value={value.installments.num_installments}
                onChange={(e) =>
                  patch({
                    installments: {
                      ...value.installments,
                      num_installments: Math.max(1, Number(e.target.value) || 1),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Importo rata (€)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={value.installments.installment_amount}
                onChange={(e) =>
                  patch({
                    installments: {
                      ...value.installments,
                      installment_amount: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Prima scadenza</Label>
              <Input
                type="date"
                value={value.installments.first_due_date}
                onChange={(e) =>
                  patch({
                    installments: {
                      ...value.installments,
                      first_due_date: e.target.value,
                    },
                  })
                }
              />
            </div>
          </div>
        </section>
      )}

      {/* Contracts */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          Contratti{" "}
          {value.mode === "deposit_financing" && (
            <span className="text-destructive text-xs font-normal">(obbligatori)</span>
          )}
        </h3>
        <ContractUploader
          orderId={draftOrderId}
          value={value.contract_paths}
          onChange={(paths) => patch({ contract_paths: paths })}
        />
      </section>
    </div>
  );
}
