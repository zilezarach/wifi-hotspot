import { useState } from "react";
import { Clock, Phone, CreditCard } from "lucide-react";

const PaymentForm = () => {
  const [planId, setPlanId] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Updated to match backend PLANS array exactly
  const plans = [
    {
      id: "community-freebie",
      name: "Community Freebie",
      displayDuration: "30 Minutes",
      price: 0,
      description: "100MB Data Cap",
      popular: false
    },
    {
      id: "quick-surf",
      name: "Quick Surf",
      displayDuration: "1 Hour",
      price: 10,
      description: "Unlimited Data",
      popular: false
    },
    {
      id: "daily-boost",
      name: "Daily Boost",
      displayDuration: "24 Hours",
      price: 50,
      description: "5GB Data Cap",
      popular: true
    },
    {
      id: "family-share",
      name: "Family Share",
      displayDuration: "24 Hours",
      price: 80,
      description: "10GB Shared Data",
      popular: false
    },
    {
      id: "weekly-unlimited",
      name: "Weekly Unlimited",
      displayDuration: "7 Days",
      price: 200,
      description: "Unlimited Data (5Mbps)",
      popular: false
    }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // For free plan, use the grant-free-access endpoint
      if (planId === "community-freebie") {
        // Get MikroTik parameters from URL
        const urlParams = new URLSearchParams(window.location.search);
        const userIP = urlParams.get("ip") || localStorage.getItem("userIP");
        const userMAC = urlParams.get("mac") || localStorage.getItem("userMAC");

        const response = await fetch("/api/grant-free-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ip: userIP,
            mac: userMAC,
            duration: "30m"
          })
        });

        const data = await response.json();
        setMessage(data.message || data.error);

        if (data.success) {
          setTimeout(() => {
            window.location.href = "https://google.com";
          }, 2000);
        }
      } else {
        // For paid plans, use the regular payment endpoint
        const response = await fetch("/api/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId,
            phone
          })
        });

        const data = await response.json();
        setMessage(data.message || data.error);

        if (data.success && data.checkoutRequestId) {
          // Start polling for payment status
          pollPaymentStatus(data.checkoutRequestId);
        } else if (data.success) {
          // Immediate success (shouldn't happen for paid plans)
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        }
      }
    } catch (err) {
      setMessage("Error initiating payment");
      console.error("Payment error:", err);
    } finally {
      setLoading(false);
    }
  };

  const pollPaymentStatus = (checkoutRequestId: string) => {
    const urlParams = new URLSearchParams(window.location.search);
    const userIP = urlParams.get("ip") || localStorage.getItem("userIP");

    const maxAttempts = 30; // 2.5 minutes
    let attempts = 0;

    const interval = setInterval(async () => {
      attempts++;

      try {
        const response = await fetch(`/api/session-status?ip=${userIP}&checkoutRequestId=${checkoutRequestId}`);
        const result = await response.json();

        if (result.hasActiveSession) {
          clearInterval(interval);
          setMessage("✅ Payment successful! Internet access granted.");
          setTimeout(() => {
            window.location.href = "https://google.com";
          }, 2000);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          setMessage("⏰ Payment timeout. Please try again.");
        }
      } catch (error) {
        console.error("Status check error:", error);
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          setMessage("❌ Unable to verify payment status.");
        }
      }
    }, 5000); // Check every 5 seconds
  };

  return (
    <div className="payment-form">
      <form onSubmit={handleSubmit}>
        {/* Plan Selection */}
        <div className="plan-section">
          <h3 className="section-title">
            <Clock size={20} />
            Choose Your Plan
          </h3>
          <div className="plans-grid">
            {plans.map(planOption => (
              <label
                key={planOption.id}
                className={`plan-option ${
                  planId === planOption.id ? "selected" : ""
                } ${planOption.popular ? "popular" : ""}`}>
                <input
                  type="radio"
                  name="plan"
                  value={planOption.id}
                  checked={planId === planOption.id}
                  onChange={e => setPlanId(e.target.value)}
                  className="plan-radio"
                />
                <div className="plan-content">
                  <div className="plan-header">
                    <span className="plan-duration">{planOption.displayDuration}</span>
                    <span className="plan-price">{planOption.price === 0 ? "FREE" : `KSh ${planOption.price}`}</span>
                  </div>
                  <span className="plan-description">{planOption.description}</span>
                  {planOption.popular && <span className="popular-badge">Most Popular</span>}
                </div>
                <div className="radio-indicator">
                  <div className="radio-dot"></div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Phone Input - Only show for paid plans */}
        {planId && planId !== "community-freebie" && (
          <div className="phone-section">
            <label className="input-label">
              <Phone size={16} />
              M-Pesa Phone Number
            </label>
            <input
              type="tel"
              placeholder="254712345678"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
              className="phone-input"
            />
            <p className="input-hint">Enter your Safaricom number starting with 254</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!planId || (phone === "" && planId !== "community-freebie") || loading}
          className="pay-button">
          {loading ? <div className="spinner"></div> : <CreditCard size={20} />}
          {loading ? "Processing..." : planId === "community-freebie" ? "Start Free Trial" : "Proceed with Payment"}
        </button>

        {/* Message Display */}
        {message && (
          <div className={`message ${message.includes("Error") || message.includes("error") ? "error" : "success"}`}>
            {message}
          </div>
        )}
      </form>
    </div>
  );
};

export default PaymentForm;
