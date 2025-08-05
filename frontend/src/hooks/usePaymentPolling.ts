import { useCallback, useRef, useState, useEffect } from "react";

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
  const attemptsRef = useRef(0); // Fix stale closure
  const maxAttempts = 24;

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState((prev) => ({ ...prev, isPolling: false }));
    attemptsRef.current = 0;
  }, []);

  const startPolling = useCallback(
    (
      checkoutRequestId: string,
      onSuccess: () => void,
      onError: (error: string) => void
    ) => {
      if (intervalRef.current) {
        cleanup();
      }

      setState({ isPolling: true, error: null, attempts: 0 });
      attemptsRef.current = 0;

      intervalRef.current = setInterval(async () => {
        attemptsRef.current += 1;
        setState((prev) => ({ ...prev, attempts: attemptsRef.current }));

        try {
          const response = await fetch(
            `/api/session-status?checkoutRequestId=${checkoutRequestId}`,
            {
              method: "GET",
              headers: {
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
              },
            }
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

          if (attemptsRef.current >= maxAttempts) {
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
    [cleanup, maxAttempts]
  );

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    ...state,
    startPolling,
    cleanup,
    timeRemaining: Math.max(0, (maxAttempts - state.attempts) * 5),
  };
};
