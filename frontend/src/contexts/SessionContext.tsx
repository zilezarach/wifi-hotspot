import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
} from "react";

interface SessionState {
  hasActiveSession: boolean;
  loading: boolean;
  error: string | null;
  timeRemaining: number;
  plan: {
    name: string;
    hours: number;
    dataCap: number | null;
    dataCapGB: string | null;
  } | null;
  dataUsage: {
    totalMB: number;
    uploadedMB: number;
    downloadedMB: number;
    remainingMB: number | null;
    percentUsed: number | null;
  } | null;
  expiry: string | null;
}

type SessionAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_SESSION"; payload: Partial<SessionState> }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "CLEAR_SESSION" }
  | { type: "UPDATE_TIME"; payload: number };

const initialState: SessionState = {
  hasActiveSession: false,
  loading: true,
  error: null,
  timeRemaining: 0,
  plan: null,
  dataUsage: null,
  expiry: null,
};

function sessionReducer(
  state: SessionState,
  action: SessionAction
): SessionState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload, error: null };
    case "SET_SESSION":
      return { ...state, ...action.payload, loading: false, error: null };
    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };
    case "CLEAR_SESSION":
      return { ...initialState, loading: false };
    case "UPDATE_TIME":
      return { ...state, timeRemaining: Math.max(0, action.payload) };
    default:
      return state;
  }
}

const SessionContext = createContext<{
  state: SessionState;
  dispatch: React.Dispatch<SessionAction>;
  refreshSession: () => Promise<void>;
  disconnectSession: () => Promise<void>;
} | null>(null);

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(sessionReducer, initialState);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeTickerRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  const refreshSession = async (showLoading = true) => {
    try {
      if (showLoading) dispatch({ type: "SET_LOADING", payload: true });

      const response = await fetch("/api/session-status", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      dispatch({ type: "SET_SESSION", payload: data });
      retryCountRef.current = 0; // Reset retry count on success

      // Start time ticker if session is active
      if (data.hasActiveSession && data.timeRemaining > 0) {
        startTimeTicker();
      } else {
        stopTimeTicker();
      }
    } catch (error: any) {
      console.error("Session refresh error:", error);

      retryCountRef.current++;
      if (retryCountRef.current <= maxRetries) {
        // Retry with exponential backoff
        setTimeout(() => refreshSession(false), retryCountRef.current * 2000);
      } else {
        dispatch({
          type: "SET_ERROR",
          payload: error.message || "Failed to check session status",
        });
      }
    }
  };

  const disconnectSession = async () => {
    try {
      dispatch({ type: "SET_LOADING", payload: true });

      const response = await fetch("/api/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error("Failed to disconnect");
      }

      dispatch({ type: "CLEAR_SESSION" });
      localStorage.clear();
    } catch (error: any) {
      dispatch({ type: "SET_ERROR", payload: error.message });
    }
  };

  const startTimeTicker = () => {
    if (timeTickerRef.current) clearInterval(timeTickerRef.current);

    timeTickerRef.current = setInterval(() => {
      dispatch({ type: "UPDATE_TIME", payload: state.timeRemaining - 1 });

      // If time runs out, refresh session
      if (state.timeRemaining <= 1) {
        refreshSession(false);
      }
    }, 1000);
  };

  const stopTimeTicker = () => {
    if (timeTickerRef.current) {
      clearInterval(timeTickerRef.current);
      timeTickerRef.current = null;
    }
  };

  useEffect(() => {
    // Initial session check
    refreshSession();

    // Set up periodic refresh (every 30 seconds)
    intervalRef.current = setInterval(() => {
      refreshSession(false);
    }, 30000);

    // Cleanup function
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeTickerRef.current) clearInterval(timeTickerRef.current);
    };
  }, []);

  // Handle visibility change (refresh when tab becomes visible)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshSession(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return (
    <SessionContext.Provider
      value={{ state, dispatch, refreshSession, disconnectSession }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
};
