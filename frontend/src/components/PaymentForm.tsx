import { useState } from "react";
import { Clock, Phone, CreditCard } from "lucide-react";

const PaymentForm = () => {
  const [planId, setPlanId] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Updated plans to match backend duration mapping
  const plans = [
    {
      id: "quick-surf",
      name: "Quick Surf",
      duration: "1Hr", // Changed from "1 Hour" to match backend
      displayDuration: "1 Hour",
      price: 10,
      description: "Unlimited Data",
      popular: false
    },
    {
      id: "quick-surf-4h",
      name: "Extended Surf",
      duration: "4Hrs", // Added 4-hour option
      displayDuration: "4 Hours",
      price: 30,
      description: "Unlimited Data",
      popular: false
    },
    {
      id: "half-day-boost",
      name: "Half Day Boost",
      duration: "12Hrs", // Added 12-hour option
      displayDuration: "12 Hours",
      price: 40,
      description: "5GB Data Cap",
      popular: false
    },
    {
      id: "daily-boost",
      name: "Daily Boost",
      duration: "24Hrs", // Changed from "24 Hours" to match backend
      displayDuration: "24 Hours",
      price: 50,
      description: "5GB Data Cap",
      popular: true
    },
    {
      id: "weekly-unlimited",
      name: "Weekly Unlimited",
      duration: "7d", // Using backend format
      displayDuration: "7 Days",
      price: 200,
      description: "Unlimited Data",
      popular: false
    },
    {
      id: "community-freebie",
      name: "Community Freebie",
      duration: "30m", // Using backend format for 30 minutes
      displayDuration: "30 Min/Day",
      price: 0,
      description: "Essentials Only",
      popular: false
    }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const selectedPlan = plans.find(p => p.id === planId);
      const response = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          phone,
          duration: selectedPlan?.duration // Send the backend-compatible duration
        })
      });
      const data = await response.json();
      setMessage(data.message || data.error);

      // If successful, reload to check session status
      if (data.success) {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (err) {
      setMessage("Error initiating payment");
      console.error("Unable to proceed to payment", err);
    } finally {
      setLoading(false);
    }
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
                    <span className="plan-price">KSh {planOption.price}</span>
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

        {/* Phone Input */}
        <div className="phone-section">
          <label className="input-label">
            <Phone size={16} />
            M-Pesa Phone Number
          </label>
          <input
            type="tel"
            placeholder="2547xxxxxxxx"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            required={planId !== "community-freebie"}
            className="phone-input"
          />
          <p className="input-hint">
            {planId === "community-freebie"
              ? "No phone number required for free trial"
              : "Enter your Safaricom number starting with 254"}
          </p>
        </div>

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
