import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const successMock = vi.fn();
const errorMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => successMock(...args),
    error: (...args: unknown[]) => errorMock(...args),
  },
}));

import { useMutationFeedback } from "@/hooks/useMutationFeedback";

describe("useMutationFeedback (Sprint 6)", () => {
  beforeEach(() => {
    successMock.mockReset();
    errorMock.mockReset();
  });

  it("emits a success toast with the configured title", () => {
    const { result } = renderHook(() =>
      useMutationFeedback({ successTitle: "Salvato" })
    );
    act(() => result.current.success());
    expect(successMock).toHaveBeenCalledWith(
      "Salvato",
      expect.objectContaining({ description: undefined })
    );
  });

  it("maps STALE_DEAL to a friendly italian message", () => {
    const { result } = renderHook(() => useMutationFeedback());
    act(() => result.current.error(new Error("STALE_DEAL")));
    expect(errorMock).toHaveBeenCalledWith(
      "Operazione non riuscita",
      expect.objectContaining({
        description: expect.stringContaining("modificato da un altro utente"),
      })
    );
  });

  it("maps STALE_TICKET via the same mechanism", () => {
    const { result } = renderHook(() => useMutationFeedback());
    act(() => result.current.error(new Error("STALE_TICKET")));
    expect(errorMock).toHaveBeenCalled();
    const call = errorMock.mock.calls[0];
    expect(call[1].description).toMatch(/modificato/i);
  });

  it("falls back to the raw message when no mapping matches", () => {
    const { result } = renderHook(() => useMutationFeedback());
    act(() => result.current.error(new Error("Network down")));
    expect(errorMock).toHaveBeenCalledWith(
      "Operazione non riuscita",
      expect.objectContaining({ description: "Network down" })
    );
  });

  it("respects per-call errorMap overrides", () => {
    const { result } = renderHook(() =>
      useMutationFeedback({ errorMap: { CUSTOM: "Custom message" } })
    );
    act(() => result.current.error(new Error("CUSTOM")));
    expect(errorMock).toHaveBeenCalledWith(
      "Operazione non riuscita",
      expect.objectContaining({ description: "Custom message" })
    );
  });
});
