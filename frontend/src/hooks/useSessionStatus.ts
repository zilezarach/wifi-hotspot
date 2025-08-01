import { useState, useEffect, useCallback } from "react";
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

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);

      // Get user IP from URL params or localStorage
      const urlParams = new URLSearchParams(window.location.search);
      const userIP = urlParams.get("ip") || localStorage.getItem("userIP");

      const response = await axios.get("/api/session-status", {
        params: userIP ? { ip: userIP } : {},
        timeout: 5000 // Add timeout to prevent hanging requests
      });

      setStatus(response.data);
      setLoading(false);

      // If session expired due to data cap, show message
      if (response.data.message) {
        console.log("Session message:", response.data.message);
      }
    } catch (error) {
      console.error("Session status fetch error:", error);
      setError("Failed to fetch session status");
      setLoading(false);

      // Set default status on error
      setStatus({
        hasActiveSession: false,
        timeRemaining: 0,
        plan: null,
        expiry: null,
        dataUsage: null
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    let interval: ReturnType<typeof setInterval>;

    const startPolling = async () => {
      if (!mounted) return;

      await fetchStatus();

      // Only start polling if component is still mounted and no critical error
      if (mounted && !error) {
        interval = setInterval(() => {
          if (mounted) {
            fetchStatus();
          }
        }, 30000);
      }
    };

    startPolling();

    return () => {
      mounted = false;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [fetchStatus, error]);

  return { status, loading, error, refetch: fetchStatus };
};
