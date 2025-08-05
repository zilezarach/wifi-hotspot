import { useState, useEffect, useRef } from "react";
import { Wifi, Shield, Zap, CreditCard, AlertCircle } from "lucide-react";
import PaymentForm from "./components/PaymentForm";
import ExpirationModal from "./Modal/ExpirationModal";
import FreeDurationTimer from "./components/Duration";
import { useSession, SessionProvider } from "./contexts/SessionContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

function App() {
  const [trialExpired, setTrialExpired] = useState(false);
  const [isExtendingTrial, setIsExtendingTrial] = useState(false);
  const { state, disconnectSession, refreshSession } = useSession();
  const initRef = useRef(false);

  // Safe localStorage operations
  const safeSetStorage = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`Failed to store ${key}:`, error);
    }
  };

  const safeGetStorage = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn(`Failed to get ${key}:`, error);
      return null;
    }
  };

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const urlParams = new URLSearchParams(window.location.search);
    const userIP = urlParams.get("ip");
    const userMAC = urlParams.get("mac");

    if (userIP && !safeGetStorage("userIP")) {
      safeSetStorage("userIP", userIP);
    }
    if (userMAC && !safeGetStorage("userMAC")) {
      safeSetStorage("userMAC", userMAC);
    }

    const linkOrig = urlParams.get("link-orig");
    const linkLogin = urlParams.get("link-login");
    if (linkOrig) safeSetStorage("link-orig", linkOrig);
    if (linkLogin) safeSetStorage("link-login", linkLogin);
  }, []);

  const handleTrialExpired = () => {
    setTrialExpired(true);
  };

  const handlePurchasePlan = () => {
    setTrialExpired(false);
  };

  const handleExtendTrial = async () => {
    if (isExtendingTrial) return; // Prevent double-clicks

    setIsExtendingTrial(true);

    try {
      const userIP = safeGetStorage("userIP");
      const userMAC = safeGetStorage("userMAC");

      if (!userIP) {
        alert("Unable to determine your device. Please refresh the page.");
        return;
      }

      const response = await fetch("/api/grant-free-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({
          ip: userIP,
          mac: userMAC,
          duration: "30m",
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setTrialExpired(false);
        await refreshSession();

        // Improved redirect logic
        const redirectUrl = safeGetStorage("link-orig") || "https://google.com";

        setTimeout(() => {
          try {
            window.location.replace(redirectUrl);
          } catch (error) {
            console.error("Redirect failed:", error);
            window.location.replace("https://google.com");
          }
        }, 2000);
      } else {
        throw new Error(data.message || "Failed to extend trial");
      }
    } catch (error: any) {
      console.error("Extend trial error:", error);
      alert("Error extending trial: " + (error.message || "Network error"));
    } finally {
      setIsExtendingTrial(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectSession();

      // Safe localStorage clear
      try {
        localStorage.clear();
      } catch (error) {
        console.warn("Failed to clear localStorage:", error);
      }

      window.location.reload();
    } catch (error) {
      console.error("Disconnect error:", error);
      alert("Error disconnecting. Please try again.");
    }
  };

  // Loading state with timeout
  if (state.loading) {
    return (
      <div className="loading-screen">
        <Wifi size={48} className="loading-icon animate-pulse" />
        <p>Checking session status...</p>
        <div className="loading-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    );
  }

  // Error state with retry
  if (state.error) {
    return (
      <div className="error-screen">
        <AlertCircle size={48} color="#ef4444" />
        <h2>Connection Error</h2>
        <p>{state.error}</p>
        <div className="error-actions">
          <button onClick={() => refreshSession()} className="retry-button">
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="reload-button"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  // Active session view with better data display
  if (state.hasActiveSession) {
    const timeHours = Math.floor(state.timeRemaining / 3600);
    const timeMinutes = Math.floor((state.timeRemaining % 3600) / 60);
    const timeSeconds = state.timeRemaining % 60;

    return (
      <div className="active-session">
        <div className="session-header">
          <Wifi size={32} color="#4ade80" />
          <h2>Connected to Zile WiFi</h2>
          <div className="connection-status online">
            <div className="status-indicator"></div>
            Connected
          </div>
        </div>

        <div className="session-info">
          <div className="session-detail">
            <span className="label">Active Plan:</span>
            <span className="value">{state.plan?.name ?? "Unknown"}</span>
          </div>

          <div className="session-detail">
            <span className="label">Time Remaining:</span>
            <span className="value time-remaining">
              {timeHours > 0 && `${timeHours}h `}
              {timeMinutes > 0 && `${timeMinutes}m `}
              {timeHours === 0 && timeMinutes === 0 && `${timeSeconds}s`}
            </span>
          </div>

          {state.dataUsage && (
            <>
              <div className="session-detail">
                <span className="label">Data Used:</span>
                <span className="value">
                  {state.dataUsage.totalMB.toFixed(1)}MB
                  {state.dataUsage.remainingMB !== null &&
                    state.plan?.dataCap &&
                    ` / ${state.plan.dataCap}MB`}
                </span>
              </div>

              {state.dataUsage.percentUsed !== null && (
                <div className="data-progress">
                  <div className="progress-label">
                    <span>Data Usage</span>
                    <span>{state.dataUsage.percentUsed.toFixed(1)}%</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className={`progress-fill ${
                        state.dataUsage.percentUsed > 90
                          ? "critical"
                          : state.dataUsage.percentUsed > 75
                          ? "warning"
                          : "normal"
                      }`}
                      style={{
                        width: `${Math.min(100, state.dataUsage.percentUsed)}%`,
                      }}
                    ></div>
                  </div>
                  {state.dataUsage.remainingMB !== null && (
                    <span className="remaining-data">
                      {state.dataUsage.remainingMB.toFixed(1)}MB remaining
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {state.expiry && (
            <div className="session-detail">
              <span className="label">Expires:</span>
              <span className="value">
                {new Date(state.expiry).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <FreeDurationTimer
          duration={state.timeRemaining / 60}
          onExpired={handleTrialExpired}
        />

        <div className="session-actions">
          <button onClick={handleDisconnect} className="disconnect-btn">
            Disconnect
          </button>
        </div>

        {trialExpired && (
          <ExpirationModal
            onPurchase={handlePurchasePlan}
            onExtend={handleExtendTrial}
            onDisconnect={handleDisconnect}
            isExtending={isExtendingTrial}
          />
        )}
      </div>
    );
  }

  // Main portal view
  return (
    <div className="app">
      {trialExpired && (
        <ExpirationModal
          onPurchase={handlePurchasePlan}
          onExtend={handleExtendTrial}
          onDisconnect={handleDisconnect}
          isExtending={isExtendingTrial}
        />
      )}

      <div className="header">
        <div className="logo-container">
          <Wifi size={32} />
        </div>
        <h1>Zile WiFi Hotspot</h1>
        <p className="subtitle">
          Get instant internet access with our secure WiFi hotspot. Pay with
          M-Pesa and connect immediately.
        </p>
      </div>

      <div className="features">
        <div className="feature">
          <Zap size={24} />
          <h3>Instant Access</h3>
          <p>Connect immediately after payment confirmation</p>
        </div>
        <div className="feature">
          <Shield size={24} />
          <h3>Secure Network</h3>
          <p>Protected connection with enterprise-grade security</p>
        </div>
        <div className="feature">
          <CreditCard size={24} />
          <h3>Easy Payment</h3>
          <p>Simple M-Pesa integration for hassle-free transactions</p>
        </div>
      </div>

      <PaymentForm />

      <div className="footer">
        <p>Powered by Zile and M-Pesa</p>
        <div className="footer-links">
          <a href="#" onClick={(e) => e.preventDefault()}>
            Privacy Policy
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            Terms of Service
          </a>
          <a href="#" onClick={(e) => e.preventDefault()}>
            Support
          </a>
        </div>
      </div>
    </div>
  );
}

function AppWithProviders() {
  return (
    <ErrorBoundary>
      <SessionProvider>
        <App />
      </SessionProvider>
    </ErrorBoundary>
  );
}

export default AppWithProviders;
