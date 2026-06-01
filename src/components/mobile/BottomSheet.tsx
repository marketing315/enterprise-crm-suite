import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '@/lib/utils';

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Footer actions, sticky in basso con safe-area. */
  footer?: React.ReactNode;
  /** Mostra handle drag-to-dismiss (default true). */
  showHandle?: boolean;
  /** Disattiva chiusura via overlay/escape (utile per flow critici). */
  dismissible?: boolean;
  /** Classe extra sul content. */
  className?: string;
  children?: React.ReactNode;
}

/**
 * BottomSheet — wrapper standardizzato su vaul per il mobile redesign.
 * Handle, header sticky, body scroll, footer azioni con safe-area, focus trap nativo vaul.
 * Rispetta `prefers-reduced-motion` via utility F0.3 sul motion sottostante (vaul disabilita autonomamente).
 */
export const BottomSheet = ({
  open,
  onOpenChange,
  title,
  description,
  footer,
  showHandle = true,
  dismissible = true,
  className,
  children,
}: BottomSheetProps) => {
  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} dismissible={dismissible} shouldScaleBackground>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm" />
        <DrawerPrimitive.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl border border-border/40 bg-background shadow-sheet outline-none',
            className,
          )}
        >
          {showHandle && (
            <div className="flex justify-center pt-2" aria-hidden>
              <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
            </div>
          )}
          {(title || description) && (
            <header className="px-5 pb-2 pt-3 text-left">
              {title && (
                <DrawerPrimitive.Title className="text-[17px] font-semibold leading-tight tracking-tight text-foreground">
                  {title}
                </DrawerPrimitive.Title>
              )}
              {description && (
                <DrawerPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                  {description}
                </DrawerPrimitive.Description>
              )}
            </header>
          )}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-3">{children}</div>
          {footer && (
            <footer className="border-t border-border/40 bg-background/85 px-5 pb-safe pt-3 backdrop-blur-xl">
              {footer}
            </footer>
          )}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
};

BottomSheet.displayName = 'BottomSheet';
