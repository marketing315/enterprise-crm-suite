/**
 * ContractUploader — uploads contract files/images to the existing
 * `sale-documents` bucket. Path is prefixed with userId for RLS.
 */
import { useState } from "react";
import { FileText, Image as ImageIcon, X, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPT = "image/*,application/pdf";
const BUCKET = "sale-documents";

interface UploadedFile {
  path: string;
  name: string;
  type: string;
}

interface Props {
  /** Used as folder prefix after userId. Typically the (draft) order id. */
  orderId: string;
  value: string[];
  onChange: (paths: string[]) => void;
}

export function ContractUploader({ orderId, value, onChange }: Props) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedFile[]>(
    value.map((p) => ({ path: p, name: p.split("/").pop() || p, type: p.endsWith(".pdf") ? "application/pdf" : "image/*" }))
  );

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !user?.id) return;
    setUploading(true);
    const next: UploadedFile[] = [...uploaded];
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name}: file troppo grande (max 10MB)`);
          continue;
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${orderId}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) {
          toast.error(`Upload fallito: ${file.name}`);
          continue;
        }
        next.push({ path, name: file.name, type: file.type });
      }
      setUploaded(next);
      onChange(next.map((u) => u.path));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeFile = async (path: string) => {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => null);
    const next = uploaded.filter((u) => u.path !== path);
    setUploaded(next);
    onChange(next.map((u) => u.path));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="inline-flex">
          <input
            type="file"
            multiple
            accept={ACCEPT}
            onChange={handleSelect}
            className="hidden"
            disabled={uploading}
          />
          <Button type="button" variant="outline" size="sm" asChild>
            <span className="cursor-pointer">
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Caricamento…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" /> Carica contratti
                </>
              )}
            </span>
          </Button>
        </label>
        <span className="text-xs text-muted-foreground">PDF o immagini, max 10MB</span>
      </div>

      {uploaded.length > 0 && (
        <ul className="space-y-1.5">
          {uploaded.map((u) => {
            const isImg = u.type.startsWith("image/");
            const Icon = isImg ? ImageIcon : FileText;
            return (
              <li
                key={u.path}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2 py-1.5"
              >
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xs truncate flex-1">{u.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => removeFile(u.path)}
                  aria-label="Rimuovi"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
