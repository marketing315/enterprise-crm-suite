import { Building } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface ContactCompanySectionProps {
  contact: Record<string, any>;
}

export function ContactCompanySection({ contact }: ContactCompanySectionProps) {
  const companyName = contact.company_name;
  const companyAddress = contact.company_address;
  const companyCity = contact.company_city;
  const companyProvince = contact.company_province;
  const companyZip = contact.company_zip;
  const vatNumber = contact.vat_number;
  const fiscalCode = contact.fiscal_code;
  const fax = contact.fax;

  const hasAnyData = companyName || companyAddress || companyCity || companyProvince || companyZip || vatNumber || fiscalCode || fax;

  if (!hasAnyData) return null;

  const companyLocation = [companyCity, companyProvince, companyZip].filter(Boolean).join(' ');

  return (
    <>
      <Separator />
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <Building className="h-4 w-4" />
          Dati Aziendali
        </h3>
        <div className="rounded-lg border p-3 space-y-2 text-sm">
          {companyName && (
            <div>
              <span className="text-muted-foreground">Ragione Sociale:</span>{' '}
              <span className="font-medium">{companyName}</span>
            </div>
          )}
          {(companyAddress || companyLocation) && (
            <div>
              <span className="text-muted-foreground">Sede:</span>{' '}
              {companyAddress && <span>{companyAddress}</span>}
              {companyAddress && companyLocation && ', '}
              {companyLocation && <span>{companyLocation}</span>}
            </div>
          )}
          {vatNumber && (
            <div>
              <span className="text-muted-foreground">P.IVA:</span> {vatNumber}
            </div>
          )}
          {fiscalCode && (
            <div>
              <span className="text-muted-foreground">Codice Fiscale:</span> {fiscalCode}
            </div>
          )}
          {fax && (
            <div>
              <span className="text-muted-foreground">Fax:</span> {fax}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
