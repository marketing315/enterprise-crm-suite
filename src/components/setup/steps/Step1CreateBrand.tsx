import { useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SetupStepCard } from "../SetupStepCard";
import { useCreateBrand, slugify } from "@/hooks/useCreateBrand";
import { useMarkSetupStep } from "@/hooks/useAdminSetupProgress";
import { useBrand } from "@/contexts/BrandContext";

export function Step1CreateBrand({ completed, stepNumber }: { completed: boolean; stepNumber: number }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const { setCurrentBrand, refetchBrands } = useBrand();
  const markStep = useMarkSetupStep();

  const createBrand = useCreateBrand({
    onSuccess: (data) => {
      toast.success(`Brand "${data.name}" creato`);
      setCurrentBrand(data as never);
      refetchBrands();
      markStep.mutate("brand_created");
      setName("");
      setSlug("");
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) return toast.error("Inserisci un nome");
    const finalSlug = (slug.trim() || slugify(name)).trim();
    if (!finalSlug) return toast.error("Slug non valido");
    createBrand.mutate({ name: name.trim(), slug: finalSlug });
  };

  return (
    <SetupStepCard
      step={stepNumber}
      icon={Building2}
      title="Crea il primo brand"
      description="Un brand rappresenta un'azienda o linea di business. Tutti i dati (lead, deal, ticket) sono organizzati per brand."
      completed={completed}
    >
      {!completed && (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <Label htmlFor="brand-name" className="text-xs">Nome</Label>
            <Input
              id="brand-name"
              placeholder="Es. Acme"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug) setSlug(slugify(e.target.value));
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="brand-slug" className="text-xs">Slug</Label>
            <Input id="brand-slug" placeholder="acme" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} />
          </div>
          <div className="flex items-end">
            <Button onClick={handleSubmit} disabled={createBrand.isPending} className="w-full sm:w-auto">
              {createBrand.isPending ? "Creazione..." : "Crea brand"}
            </Button>
          </div>
        </div>
      )}
    </SetupStepCard>
  );
}
