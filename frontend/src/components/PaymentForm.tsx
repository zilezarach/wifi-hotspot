import { useState } from "react";
import { Clock, Phone, CreditCard } from "lucide-react";

const PaymentForm = () => {
  const [planId, setPlanId] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const plans = [
    {
      id: "quick-surf",
      name: "Quick Surf",
      duration: "1 Hour",
      price: 10,
      description: "Unlimited Data",
      popular: false,
    },
    {
      id: "daily-boost",
      name: "Daily Boost",
      duration: "24 Hours",
      price: 50,
      description: "5GB Data Cap",
      popular: true,
    },
    {
      id: "family-share",
      name: "Family Share",
      duration: "24 Hours",
      price: 80,
      description: "10GB Shared Data",
      popular: false,
    },
    {
      id: "weekly-unlimited",
      name: "Weekly Unlimited",
      duration: "7 Days",
      price: 200,
      description: "Unlimited Data",
      popular: false,
    },
    {
      id: "community-freebie",
      name: "Community Freebie",
      duration: "30 Min/Day",
      price: 0,
      description: "Essentials Only",
      popular: false,
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, phone }),
      });
      const data = await response.json();
      setMessage(data.message || data.error);
    } catch (error) {
      setMessage("Error initiating payment");
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
            {plans.map((planOption) => (
              <label
                key={planOption.id}
                className={`plan-option ${
                  planId === planOption.id ? "selected" : ""
                } ${planOption.popular ? "popular" : ""}`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={planOption.id}
                  checked={planId === planOption.id}
                  onChange={(e) => setPlanId(e.target.value)}
                  className="plan-radio"
                />
                <div className="plan-content">
                  <div className="plan-header">
                    <span className="plan-duration">{planOption.duration}</span>
                    <span className="plan-price">KSh {planOption.price}</span>
                  </div>
                  <span className="plan-description">
                    {planOption.description}
                  </span>
                  {planOption.popular && (
                    <span className="popular-badge">Most Popular</span>
                  )}
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
            onChange={(e) => setPhone(e.target.value)}
            required
            className="phone-input"
          />
          <p className="input-hint">
            Enter your Safaricom number starting with 254
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={
            !planId ||
            (phone === "" && planId !== "community-freebie") ||
            loading
          }
          className="pay-button"
        >
          {loading ? <div className="spinner"></div> : <CreditCard size={20} />}
          {loading ? "Processing..." : "Proceed with Plan"}
        </button>

        {/* Message Display */}
        {message && (
          <div
            className={`message ${
              message.includes("Error") || message.includes("error")
                ? "error"
                : "success"
            }`}
          >
            {message}
          </div>
        )}
      </form>
    </div>
  );
};

export default PaymentForm;
