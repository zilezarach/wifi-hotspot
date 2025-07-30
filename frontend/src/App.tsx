import PaymentForm from "./components/PaymentForm";
import { Wifi, Shield, Zap, CreditCard } from "lucide-react";
import { useState } from "react";
import ExpirationModal from "./Modal/ExpirationModal";
import WelcomeModal from "./Modal/WelcomeModal";
import FreeDurationTimer from "./components/Duration";
import { useSessionStatus } from "./hooks/useSessionStatus";

function App() {
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [freeTrialStarted, setFreeTrialStarted] = useState(false);
  const [trialExpired, setTrialExpired] = useState(false);
  const { status, loading } = useSessionStatus();
  const handleAcceptFreeTrial = () => {
    setShowWelcomeModal(false);
    setFreeTrialStarted(true);
  };

  const handleTrialExpired = () => {
    setTrialExpired(true);
  };

  const handleDeclineFreeTrial = () => {
    setShowWelcomeModal(false);
  };

  const handlePurchasePlan = () => {
    setTrialExpired(false);
  };

  const handleExtendTrial = () => {
    setTrialExpired(false);
  };

  const handleDisconnect = () => {
    console.log("User disconnected");
  };

  if (loading) {
    return <div>Loading Seasion status ...</div>;
  }

  if (status.hasActiveSession) {
    return (
      <div className="active-session">
        <h2>Active Session</h2>
        <p>Plan: {status.plan?.name ?? "Unknown"}</p>
        <FreeDurationTimer
          duration={status.timeRemaining / 60} // Convert seconds to minutes for your timer
          onExpired={handleTrialExpired}
        />
        <p>
          Expires:{" "}
          {status.expiry ? new Date(status.expiry).toLocaleString() : "N/A"}
        </p>
      </div>
    );
  }

  return (
    <div className="app">
      {showWelcomeModal && (
        <WelcomeModal
          onAccept={handleAcceptFreeTrial}
          onDecline={handleDeclineFreeTrial}
        />
      )}
      {trialExpired && (
        <ExpirationModal
          onPurchase={handlePurchasePlan}
          onExtend={handleExtendTrial}
          onDisconnect={handleDisconnect}
        />
      )}
      {/* Header */}
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
      {freeTrialStarted && !trialExpired && (
        <FreeDurationTimer duration={30} onExpired={handleTrialExpired} />
      )}
      {/* Footer */}
      <div className="footer">
        <p>Powered by Zile and M-Pesa</p>
      </div>
    </div>
  );
}

export default App;
