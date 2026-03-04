import { toast } from "sonner";

/**
 * Safe clipboard write with error handling and user feedback.
 * Falls back gracefully in insecure contexts or when permission is denied.
 */
export async function copyToClipboard(text: string, label?: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label ? `${label} copiato negli appunti` : "Copiato negli appunti");
    return true;
  } catch {
    // Fallback for insecure contexts
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      toast.success(label ? `${label} copiato negli appunti` : "Copiato negli appunti");
      return true;
    } catch {
      toast.error("Impossibile copiare negli appunti");
      return false;
    }
  }
}
