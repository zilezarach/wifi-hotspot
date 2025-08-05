import { useState, useCallback } from "react";
import { Clock, Phone, CreditCard, AlertCircle, CheckCircle, Loader } from "lucide-react";
import { usePaymentPolling } from "../hooks/usePaymentPolling";
import { useSession } from "../contexts/SessionContext";

interface Plan {
  id: string;
  name: string;
  displayDuration: string;
  price: number;
  description: string;
  popular: boolean;
}

const PaymentForm = () => {
  const [planId, setPlanId] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const { startPolling, isPolling, cleanup, timeRemaining } = usePaymentPolling();
  const { refreshSession } = useSession();

  const plans: Plan[] = [
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

  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {};

    if (!planId) {
      errors.planId = "Please select a plan";
    }

    if (planId && planId !== "community-freebie") {
      if (!phone) {
        errors.phone = "Phone number is required for paid plans";
      } else if (!/^254\d{9}$/.test(phone)) {
        errors.phone = "Please enter a valid Kenyan phone number (254xxxxxxxxx)";
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [planId, phone]);

  const showMessage = useCallback((msg: string, type: "success" | "error" | "info" = "info") => {
    setMessage(msg);
    setMessageType(type);

    // Auto-clear success messages after 5 seconds
    if (type === "success") {
      setTimeout(() => setMessage(""), 5000);
    }
  }, []);

  const handleFreeAccess = useCallback(async () => {
    try {
      const userIP = localStorage.getItem("userIP") || new URLSearchParams(window.location.search).get("ip");
      const userMAC = localStorage.getItem("userMAC") || new URLSearchParams(window.location.search).get("mac");

      if (!userIP) {
        throw new Error("Unable to determine your IP address. Please try refreshing the page.");
      }

      const response = await fetch("/api/grant-free-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: userIP,
          mac: userMAC,
          duration: "30m"
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        showMessage("🎉 Free access granted successfully! Redirecting...", "success");

        // Refresh session state
        await refreshSession();

        // Redirect after a short delay
        setTimeout(() => {
          window.location.replace("https://google.com");
        }, 2000);
      } else {
        throw new Error(data.message || "Failed to grant free access");
      }
    } catch (error: any) {
      console.error("Free access error:", error);
      showMessage(`Error: ${error.message}`, "error");
    }
  }, [refreshSession, showMessage]);

  const handlePaidPlan = useCallback(async () => {
    try {
      const response = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, phone })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.checkoutRequestId) {
        showMessage("📱 Payment request sent to your phone. Please complete the M-Pesa transaction.", "info");

        // Start polling for payment confirmation
        startPolling(
          data.checkoutRequestId,
          async () => {
            showMessage("✅ Payment successful! Internet access granted. Redirecting...", "success");
            await refreshSession();
            setTimeout(() => {
              window.location.replace("https://google.com");
            }, 2000);
          },
          error => {
            showMessage(error, "error");
          }
        );
      } else if (data.success) {
        // Immediate success (shouldn't happen for paid plans)
        showMessage("✅ Access granted successfully!", "success");
        await refreshSession();
      } else {
        throw new Error(data.error || "Payment initiation failed");
      }
    } catch (error: any) {
      console.error("Payment error:", error);
      showMessage(`Payment failed: ${error.message}`, "error");
    }
  }, [planId, phone, startPolling, refreshSession, showMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showMessage("Please fix the errors below", "error");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const selectedPlan = plans.find(p => p.id === planId);
      if (!selectedPlan) {
        throw new Error("Invalid plan selected");
      }

      if (selectedPlan.price === 0) {
        await handleFreeAccess();
      } else {
        await handlePaidPlan();
      }
    } catch (error: any) {
      showMessage(`Error: ${error.message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    cleanup();
    setMessage("");
    setIsSubmitting(false);
  };

  // Get selected plan for display purposes
  const currentPlan = plans.find(p => p.id === planId);

  return (
    <div className="payment-form">
      <form onSubmit={handleSubmit}>
        {/* Plan Selection */}
        <div className="plan-section">
          <h3 className="section-title">
            <Clock size={20} />
            Choose Your Plan
          </h3>

          {validationErrors.planId && (
            <div className="validation-error">
              <AlertCircle size={16} />
              {validationErrors.planId}
            </div>
          )}

          <div className="plans-grid">
            {plans.map(planOption => (
              <label
                key={planOption.id}
                className={`plan-option ${
                  planId === planOption.id ? "selected" : ""
                } ${planOption.popular ? "popular" : ""} ${isSubmitting || isPolling ? "disabled" : ""}`}>
                <input
                  type="radio"
                  name="plan"
                  value={planOption.id}
                  checked={planId === planOption.id}
                  onChange={e => setPlanId(e.target.value)}
                  disabled={isSubmitting || isPolling}
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

            {validationErrors.phone && (
              <div className="validation-error">
                <AlertCircle size={16} />
                {validationErrors.phone}
              </div>
            )}

            <input
              type="tel"
              placeholder="254712345678"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ""))} // Only allow digits
              disabled={isSubmitting || isPolling}
              className={`phone-input ${validationErrors.phone ? "error" : ""}`}
              maxLength={12}
            />
            <p className="input-hint">Enter your Safaricom number starting with 254</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!planId || (phone === "" && planId !== "community-freebie") || isSubmitting || isPolling}
          className="pay-button">
          {isSubmitting || isPolling ? (
            <Loader size={20} className="spinner" />
          ) : currentPlan?.price === 0 ? (
            <>
              <CheckCircle size={20} />
              Start Free Trial
            </>
          ) : (
            <>
              <CreditCard size={20} />
              Proceed with Payment
            </>
          )}

          {isSubmitting
            ? "Processing..."
            : isPolling
              ? `Waiting for payment... (${Math.floor(timeRemaining / 60)}:${(timeRemaining % 60)
                  .toString()
                  .padStart(2, "0")})`
              : currentPlan?.price === 0
                ? "Start Free Trial"
                : "Proceed with Payment"}
        </button>

        {/* Cancel Button - Show when polling */}
        {isPolling && (
          <button type="button" onClick={handleCancel} className="cancel-button">
            Cancel Payment
          </button>
        )}

        {/* Message Display */}
        {message && (
          <div className={`message ${messageType}`}>
            {messageType === "success" && <CheckCircle size={16} />}
            {messageType === "error" && <AlertCircle size={16} />}
            {messageType === "info" && <Clock size={16} />}
            {message}
          </div>
        )}

        {/* Payment Instructions - Show when polling */}
        {isPolling && (
          <div className="payment-instructions">
            <h4>Complete Payment on Your Phone</h4>
            <ol>
              <li>Check your phone for M-Pesa payment request</li>
              <li>Enter your M-Pesa PIN to complete payment</li>
              <li>Wait for confirmation (this may take up to 2 minutes)</li>
            </ol>
            <p className="polling-status">
              ⏱️ Checking payment status... {Math.floor(timeRemaining / 60)}:
              {(timeRemaining % 60).toString().padStart(2, "0")} remaining
            </p>
          </div>
        )}
      </form>
    </div>
  );
};

export default PaymentForm;
