import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Custom hook for debounced search with cancellation support.
 * Returns the debounced value and a function to update the input value.
 * 
 * @param initialValue - Initial search value
 * @param delay - Debounce delay in milliseconds (default: 300ms)
 * @param onDebouncedChange - Callback fired when debounced value changes
 */
export function useDebouncedSearch(
  initialValue: string = "",
  delay: number = 300,
  onDebouncedChange?: (value: string) => void
) {
  const [inputValue, setInputValue] = useState(initialValue);
  const [debouncedValue, setDebouncedValue] = useState(initialValue);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Handle debounce logic
  useEffect(() => {
    // Skip if values are already in sync
    if (inputValue === debouncedValue) {
      setIsDebouncing(false);
      return;
    }

    setIsDebouncing(true);

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(inputValue);
      setIsDebouncing(false);
      onDebouncedChange?.(inputValue);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [inputValue, delay, debouncedValue, onDebouncedChange]);

  // Force immediate update (bypass debounce)
  const flushDebounce = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setDebouncedValue(inputValue);
    setIsDebouncing(false);
    onDebouncedChange?.(inputValue);
  }, [inputValue, onDebouncedChange]);

  // Reset to a specific value
  const reset = useCallback((value: string = "") => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setInputValue(value);
    setDebouncedValue(value);
    setIsDebouncing(false);
  }, []);

  return {
    inputValue,
    setInputValue,
    debouncedValue,
    isDebouncing,
    flushDebounce,
    reset,
  };
}
