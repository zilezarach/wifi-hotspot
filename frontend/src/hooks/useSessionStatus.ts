import { useState, useEffect } from "react";
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

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        // Get user IP from URL params or localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const userIP = urlParams.get("ip") || localStorage.getItem("userIP");

        const response = await axios.get("/api/session-status", {
          params: userIP ? { ip: userIP } : {}
        });

        setStatus(response.data);
        setLoading(false);

        // If session expired due to data cap, show message
        if (response.data.message) {
          console.log("Session message:", response.data.message);
        }
      } catch (error) {
        console.error("Session status fetch error:", error);
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
    };

    fetchStatus();

    // Poll every 30 seconds for status updates
    const interval = setInterval(fetchStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  return { status, loading };
};
