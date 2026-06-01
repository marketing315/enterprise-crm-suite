import { useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface BiometricPinPadProps {
  length?: number;
  value: string;
  onChange: (next: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Mostra le cifre in chiaro. Default false (pallini). */
  reveal?: boolean;
}

/**
 * Tastierino numerico per il PIN biometrico.
 * - Target tap 56×56 (mobile-friendly).
 * - Supporta tastiera fisica (cifre + Backspace).
 * - onComplete viene chiamato quando il PIN raggiunge la lunghezza richiesta.
 */
export function BiometricPinPad({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  reveal = false,
}: BiometricPinPadProps) {
  const [shake, setShake] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (autoFocus && containerRef.current) {
      containerRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    if (value.length === length && !completedRef.current) {
      completedRef.current = true;
      onComplete?.(value);
    }
    if (value.length < length) {
      completedRef.current = false;
    }
  }, [value, length, onComplete]);

  const append = (d: string) => {
    if (disabled) return;
    if (value.length >= length) {
      setShake(true);
      window.setTimeout(() => setShake(false), 200);
      return;
    }
    onChange((value + d).slice(0, length));
  };

  const remove = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      if (/^[0-9]$/.test(e.key)) {
        append(e.key);
      } else if (e.key === "Backspace") {
        remove();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, disabled]);

  const dots = Array.from({ length }, (_, i) => i);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"];

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="flex flex-col items-center gap-6 outline-none"
      aria-label="Inserisci il PIN"
    >
      <div
        className={cn(
          "flex items-center gap-3 transition-transform",
          shake && "animate-pulse",
        )}
        aria-live="polite"
      >
        {dots.map((i) => {
          const filled = i < value.length;
          if (reveal) {
            return (
              <span
                key={i}
                className={cn(
                  "inline-flex h-10 w-8 items-center justify-center rounded-md border text-lg font-medium tabular-nums",
                  filled ? "border-foreground/40 bg-muted" : "border-border/60",
                )}
              >
                {filled ? value[i] : ""}
              </span>
            );
          }
          return (
            <span
              key={i}
              className={cn(
                "h-3 w-3 rounded-full transition-colors",
                filled ? "bg-primary" : "bg-muted-foreground/30",
              )}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {keys.map((k, idx) => {
          if (k === "") return <div key={`spacer-${idx}`} className="h-14 w-14" />;
          if (k === "←") {
            return (
              <button
                key="back"
                type="button"
                onClick={remove}
                disabled={disabled || value.length === 0}
                aria-label="Cancella ultima cifra"
                className={cn(
                  "inline-flex h-14 w-14 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground transition-colors",
                  "hover:bg-accent hover:text-foreground active:scale-95",
                  "disabled:opacity-40",
                )}
              >
                <Delete className="h-5 w-5" />
              </button>
            );
          }
          return (
            <button
              key={k}
              type="button"
              onClick={() => append(k)}
              disabled={disabled}
              aria-label={`Cifra ${k}`}
              className={cn(
                "inline-flex h-14 w-14 items-center justify-center rounded-full border border-border/60 bg-background text-xl font-medium tabular-nums transition-colors",
                "hover:bg-accent active:scale-95",
                "disabled:opacity-40",
              )}
            >
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}
