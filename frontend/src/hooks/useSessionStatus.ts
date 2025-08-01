import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";

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
    dataUsage: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setError(null);

      const response = await axios.get("/api/session-status", {
        timeout: 10000,
        // Add cache prevention
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache"
        }
      });

      if (mountedRef.current) {
        setStatus(response.data);
        setLoading(false);
      }
    } catch (error) {
      console.error("Session status fetch error:", error);
      if (mountedRef.current) {
        setError("Failed to fetch session status");
        setLoading(false);
        setStatus({
          hasActiveSession: false,
          timeRemaining: 0,
          plan: null,
          expiry: null,
          dataUsage: null
        });
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Initial fetch
    fetchStatus();

    // Set up polling only after initial fetch
    const setupPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = setInterval(() => {
        if (mountedRef.current) {
          fetchStatus();
        }
      }, 45000); // Increased to 45 seconds to reduce load
    };

    // Start polling after initial load
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
