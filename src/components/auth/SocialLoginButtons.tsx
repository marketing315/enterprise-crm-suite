import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable/index";

type Provider = "google" | "apple";

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 11v3.2h5.3c-.2 1.4-1.6 4.1-5.3 4.1-3.2 0-5.8-2.6-5.8-5.8s2.6-5.8 5.8-5.8c1.8 0 3 .8 3.7 1.4l2.5-2.4C16.7 4.3 14.6 3.3 12 3.3 7.2 3.3 3.3 7.2 3.3 12s3.9 8.7 8.7 8.7c5 0 8.3-3.5 8.3-8.5 0-.6-.1-1-.1-1.5H12z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.26 3.18-1.02 1.18-2.25 1.86-3.58 1.75-.04-1.1.42-2.23 1.21-3.16.86-1.02 2.31-1.78 3.63-1.77zM20.5 17.36c-.55 1.27-.81 1.83-1.52 2.95-.99 1.57-2.38 3.52-4.1 3.53-1.53.02-1.92-.99-4-.98-2.07.01-2.51 1-4.04.98-1.72-.02-3.04-1.77-4.03-3.34C.05 16.21-.24 11.07 1.51 8.33c1.24-1.94 3.2-3.07 5.04-3.07 1.88 0 3.06 1.03 4.61 1.03 1.51 0 2.43-1.03 4.6-1.03 1.65 0 3.39.9 4.63 2.45-4.07 2.23-3.4 8.04.11 9.65z" />
    </svg>
  );
}

export function SocialLoginButtons() {
  const [busy, setBusy] = useState<Provider | null>(null);

  const handleSignIn = async (provider: Provider) => {
    setBusy(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result?.error) {
        toast.error(result.error.message || `Accesso con ${provider} non riuscito`);
        setBusy(null);
        return;
      }
      // redirected → il browser passa a provider, nessun reset
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore imprevisto");
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full md:h-10"
        disabled={busy !== null}
        onClick={() => handleSignIn("google")}
      >
        {busy === "google" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <span className="mr-2 inline-flex"><GoogleIcon /></span>
        )}
        Accedi con Google
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full md:h-10"
        disabled={busy !== null}
        onClick={() => handleSignIn("apple")}
      >
        {busy === "apple" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <span className="mr-2 inline-flex"><AppleIcon /></span>
        )}
        Accedi con Apple
      </Button>
    </div>
  );
}
