import React, { useCallback, useRef, useState } from "react";

interface PaymentPollingState {
  isPolling: boolean;
  error: string | null;
  attempts: number;
}

export const usePaymentPolling = () => {
  const [state, setState] = useState<PaymentPollingState>({
    isPolling: false,
    error: null,
    attempts: 0,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const maxAttempts = 24; // 2 minutes at 5s intervals

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState((prev) => ({ ...prev, isPolling: false }));
  }, []);

  const startPolling = useCallback(
    (
      checkoutRequestId: string,
      onSuccess: () => void,
      onError: (error: string) => void
    ) => {
      if (intervalRef.current) {
        cleanup(); // Stop any existing polling
      }

      setState({ isPolling: true, error: null, attempts: 0 });

      intervalRef.current = setInterval(async () => {
        setState((prev) => ({ ...prev, attempts: prev.attempts + 1 }));

        try {
          const response = await fetch(
            `/api/session-status?checkoutRequestId=${checkoutRequestId}`
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const result = await response.json();

          if (result.hasActiveSession) {
            cleanup();
            onSuccess();
            return;
          }

          if (state.attempts >= maxAttempts) {
            cleanup();
            onError(
              "Payment verification timeout. Please check your M-Pesa messages or try again."
            );
            return;
          }
        } catch (error: any) {
          console.error("Payment polling error:", error);
          cleanup();
          onError(`Payment verification failed: ${error.message}`);
        }
      }, 5000);
    },
    [cleanup, maxAttempts, state.attempts]
  );

  // Cleanup on unmount
  React.useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    ...state,
    startPolling,
    cleanup,
    timeRemaining: Math.max(0, (maxAttempts - state.attempts) * 5), // seconds remaining
  };
};
