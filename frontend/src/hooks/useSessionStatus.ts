import { useState, useEffect } from "react";
import axios from "axios";

interface SessionPlan {
  name: string;
  hours: number;
  dataCap: number | null;
}

interface SessionStatus {
  hasActiveSession: boolean;
  timeRemaining: number;
  plan: SessionPlan | null;
  expiry: string | null;
}

export const useSessionStatus = () => {
  const [status, setStatus] = useState<SessionStatus>({
    hasActiveSession: false,
    timeRemaining: 0,
    plan: null,
    expiry: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await axios.get("/api/session-status");
        setStatus(response.data);
        setLoading(false);
        if (!response.data.hasActiveSession) {
          window.location.reload();
        }
      } catch (error) {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  return { status, loading };
};
