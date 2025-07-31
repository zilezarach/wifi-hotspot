import PaymentForm from "./components/PaymentForm";
import { Wifi, Shield, Zap, CreditCard } from "lucide-react";
import { useState } from "react";
import ExpirationModal from "./Modal/ExpirationModal";
import WelcomeModal from "./Modal/WelcomeModal";
import FreeDurationTimer from "./components/Duration";
import { useSessionStatus } from "./hooks/useSessionStatus";

function App() {
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [trialExpired, setTrialExpired] = useState(false);
  const { status, loading } = useSessionStatus();

  const handleAcceptFreeTrial = async () => {
    try {
      const response = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: "community-freebie",
          duration: "30m"
        })
      });
      const data = await response.json();
      console.log("API Response:", data);

      if (data.success) {
        setShowWelcomeModal(false);
        // Reload to check session status
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        alert("Error: " + (data.message || data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Fetch error:", error);
      alert("Network error starting trial.");
    }
  };

  const handleTrialExpired = () => {
    setTrialExpired(true);
  };

  const handleDeclineFreeTrial = () => {
    setShowWelcomeModal(false);
  };

  const handlePurchasePlan = () => {
    setTrialExpired(false);
    setShowWelcomeModal(false);
  };

  const handleExtendTrial = async () => {
    await handleAcceptFreeTrial();
    setTrialExpired(false);
  };

  const handleDisconnect = async () => {
    try {
      await fetch("/api/disconnect", { method: "POST" });
      console.log("User disconnected");
      window.location.reload();
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <Wifi size={48} className="loading-icon" />
        <p>Checking session status...</p>
      </div>
    );
  }

  if (status.hasActiveSession) {
    return (
      <div className="active-session">
        <div className="session-header">
          <Wifi size={32} color="#4ade80" />
          <h2>Connected to Zile WiFi</h2>
        </div>

        <div className="session-info">
          <div className="session-detail">
            <span className="label">Active Plan:</span>
            <span className="value">{status.plan?.name ?? "Unknown"}</span>
          </div>

          <div className="session-detail">
            <span className="label">Time Remaining:</span>
            <span className="value">
              {Math.floor(status.timeRemaining / 3600)}h {Math.floor((status.timeRemaining % 3600) / 60)}m
            </span>
          </div>

          {status.expiry && (
            <div className="session-detail">
              <span className="label">Expires:</span>
              <span className="value">{new Date(status.expiry).toLocaleString()}</span>
            </div>
          )}
        </div>

        <FreeDurationTimer duration={status.timeRemaining / 60} onExpired={handleTrialExpired} />

        <div className="session-actions">
          <button onClick={() => setShowWelcomeModal(false)} className="upgrade-btn">
            Upgrade Plan
          </button>
          <button onClick={handleDisconnect} className="disconnect-btn">
            Disconnect
          </button>
        </div>

        {trialExpired && (
          <ExpirationModal
            onPurchase={handlePurchasePlan}
            onExtend={handleExtendTrial}
            onDisconnect={handleDisconnect}
          />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      {showWelcomeModal && <WelcomeModal onAccept={handleAcceptFreeTrial} onDecline={handleDeclineFreeTrial} />}

      {trialExpired && (
        <ExpirationModal onPurchase={handlePurchasePlan} onExtend={handleExtendTrial} onDisconnect={handleDisconnect} />
      )}

      {/* Header */}
      <div className="header">
        <div className="logo-container">
          <Wifi size={32} />
        </div>
        <h1>Zile WiFi Hotspot</h1>
        <p className="subtitle">
          Get instant internet access with our secure WiFi hotspot. Pay with M-Pesa and connect immediately.
        </p>
      </div>

      {/* Features */}
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

      {/* Payment Form */}
      <PaymentForm />

      {/* Footer */}
      <div className="footer">
        <p>Powered by Zile and M-Pesa</p>
      </div>
    </div>
  );
}

export default App;
