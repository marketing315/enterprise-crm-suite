/**
 * Accessibility helpers (Batch E).
 *
 * Usage on non-native clickable elements (div/span with onClick):
 *   <div role="button" tabIndex={0} onClick={fn} onKeyDown={onActivateKey(fn)}>
 */
import type { KeyboardEvent } from "react";

/**
 * Returns a keyboard handler that fires the given activation function
 * on Enter or Space (matching native <button> semantics).
 */
export function onActivateKey<T extends Element>(handler: () => void) {
  return (e: KeyboardEvent<T>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  };
}
