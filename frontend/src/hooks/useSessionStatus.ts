import { useState, useEffect, useCallback, useRef } from "react";

interface SessionPlan {
  name: string;
  hours: number;
  dataCap: number | null;
  dataCapGB?: string | null;
}

interface DataUsage {
  totalMB: number;
  uploadedMB: number;
  downloadedMB: number;
  remainingMB: number | null;
  percentUsed: number | null;
}

interface SessionStatus {
  hasActiveSession: boolean;
  timeRemaining: number;
  plan: SessionPlan | null;
  expiry: string | null;
  dataUsage: DataUsage | null;
  message?: string;
}

export const useSessionStatus = () => {
  const [status, setStatus] = useState<SessionStatus>({
    hasActiveSession: false,
    timeRemaining: 0,
    plan: null,
    expiry: null,
    dataUsage: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  const fetchStatus = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch("/api/session-status", {
        method: "GET",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (mountedRef.current) {
        setStatus(data);
        setLoading(false);
        retryCountRef.current = 0; // Reset retry count on success
      }
    } catch (error: any) {
      console.error("Session status fetch error:", error);

      if (mountedRef.current) {
        retryCountRef.current += 1;

        if (retryCountRef.current <= maxRetries) {
          // Retry with exponential backoff
          setTimeout(() => {
            if (mountedRef.current) {
              fetchStatus();
            }
          }, Math.pow(2, retryCountRef.current) * 1000);
        } else {
          setError("Failed to fetch session status after multiple attempts");
          setLoading(false);
          setStatus({
            hasActiveSession: false,
            timeRemaining: 0,
            plan: null,
            expiry: null,
            dataUsage: null,
          });
        }
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    fetchStatus();

    const setupPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(() => {
        if (mountedRef.current) {
          fetchStatus();
        }
      }, 30000); // Reduced to 30 seconds for better UX
    };

    const timer = setTimeout(setupPolling, 2000);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      clearTimeout(timer);
    };
  }, [fetchStatus]);

  return { status, loading, error, refetch: fetchStatus };
};
