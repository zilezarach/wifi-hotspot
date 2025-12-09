import { useState, useEffect } from "react";
import { Wifi, Clock, Database, CheckCircle, Smartphone, Globe } from "lucide-react";
import { api } from "../lib/api";

interface Plan {
  id: string;
  name: string;
  description?: string;
  hours: number;
  price: number;
  dataCap?: number;
  dataCapGB?: string;
  speedLimit?: string;
  isFeatured?: boolean;
  badge?: string;
}

interface Session {
  id: string;
  planName: string;
  expiresAt: string;
  timeRemaining: number;
  dataUsed?: number;
  dataCap?: number;
  dataCapGB?: string;
  remainingMB?: number;
  percentUsed?: number;
}

function Portal() {
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [message, setMessage] = useState<{ type: string; text: string }>({ type: "", text: "" });
  const [processing, setProcessing] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  useEffect(() => {
    loadPortal();
    const interval = setInterval(checkSession, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (timeRemaining > 0) {
      const timer = setTimeout(() => setTimeRemaining(timeRemaining - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeRemaining]);

  const loadPortal = async () => {
    setLoading(true);
    const result = await api.getPortal();

    if (result.hasActiveSession) {
      setHasSession(true);
      setSession(result.session);
      setTimeRemaining(result.session.timeRemaining || 0);
      setTenant(result.tenant);
    } else {
      setHasSession(false);
      setPlans(result.plans || []);
      setTenant(result.tenant);
    }

    setLoading(false);
  };

  const checkSession = async () => {
    const result = await api.getSessionStatus();

    if (result.hasActiveSession) {
      setHasSession(true);
      setSession(result.session);
      setTimeRemaining(result.session.timeRemaining || 0);
    } else {
      setHasSession(false);
      if (session) {
        // Session expired, reload portal
        loadPortal();
      }
    }
  };

  const handlePayment = async () => {
    if (!selectedPlan) return;

    setProcessing(true);
    setMessage({ type: "", text: "" });

    if (selectedPlan.price > 0 && !phoneNumber) {
      setMessage({ type: "error", text: "Please enter your phone number" });
      setProcessing(false);
      return;
    }

    const result = await api.initiatePayment(selectedPlan.id, selectedPlan.price > 0 ? phoneNumber : undefined);

    setProcessing(false);

    if (result.success) {
      setMessage({ type: "success", text: result.message || "Success!" });

      if (selectedPlan.price === 0) {
        // Free plan - reload immediately
        setTimeout(() => loadPortal(), 2000);
      } else {
        // Paid plan - poll for completion
        pollPaymentStatus();
      }
    } else {
      setMessage({ type: "error", text: result.error || "Payment failed" });
    }
  };

  const pollPaymentStatus = () => {
    const interval = setInterval(async () => {
      const result = await api.getSessionStatus();

      if (result.hasActiveSession) {
        clearInterval(interval);
        loadPortal();
      }
    }, 3000);

    // Stop polling after 2 minutes
    setTimeout(() => clearInterval(interval), 120000);
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect?")) return;

    setProcessing(true);
    const result = await api.disconnectSession();
    setProcessing(false);

    if (result.success) {
      setMessage({ type: "info", text: "Disconnected successfully" });
      setTimeout(() => loadPortal(), 1000);
    } else {
      setMessage({ type: "error", text: result.error || "Disconnect failed" });
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Active Session View
  if (hasSession && session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Connected!</h1>
            <p className="text-gray-600">{tenant?.name}</p>
          </div>

          <div className="space-y-4 mb-8">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-emerald-100">Time Remaining</span>
                <Clock className="w-5 h-5" />
              </div>
              <div className="text-3xl font-bold">{formatTime(timeRemaining)}</div>
              <div className="text-sm text-emerald-100 mt-1">{session.planName}</div>
            </div>

            {session.dataCap && (
              <div className="bg-blue-50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-700 font-medium">Data Usage</span>
                  <Database className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-gray-800 mb-2">
                  {session.dataUsed?.toFixed(1) || 0} MB / {session.dataCapGB} GB
                </div>
                <div className="bg-white rounded-full h-2 mb-1">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(session.percentUsed || 0, 100)}%` }}></div>
                </div>
                <div className="text-sm text-gray-600">{session.remainingMB?.toFixed(0)} MB remaining</div>
              </div>
            )}
          </div>

          {message.text && (
            <div
              className={`p-4 rounded-lg mb-4 ${
                message.type === "error"
                  ? "bg-red-50 text-red-700"
                  : message.type === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-blue-50 text-blue-700"
              }`}>
              {message.text}
            </div>
          )}

          <button
            onClick={handleDisconnect}
            disabled={processing}
            className="w-full bg-red-500 hover:bg-red-600 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50">
            {processing ? "Disconnecting..." : "Disconnect Session"}
          </button>
        </div>
      </div>
    );
  }

  // Plan Selection View
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div
          className="p-8 text-white"
          style={{
            background: `linear-gradient(135deg, ${tenant?.brandColor || "#4F46E5"} 0%, ${tenant?.brandColor || "#4F46E5"}dd 100%)`
          }}>
          <div className="flex items-center justify-center mb-4">
            <Wifi className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-bold text-center mb-2">{tenant?.name}</h1>
          <p className="text-center text-white/90">{tenant?.splashMessage}</p>
        </div>

        <div className="p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Choose Your Plan</h2>

          {message.text && (
            <div
              className={`p-4 rounded-lg mb-6 ${
                message.type === "error"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : message.type === "success"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
              }`}>
              {message.text}
            </div>
          )}

          <div className="space-y-3 mb-6">
            {plans.map(plan => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan)}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                  selectedPlan?.id === plan.id
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-gray-200 hover:border-emerald-300 hover:bg-gray-50"
                }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-800 flex items-center gap-2">
                      {plan.name}
                      {plan.badge && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
                          {plan.badge}
                        </span>
                      )}
                    </div>
                    {plan.description && <div className="text-sm text-gray-600 mt-1">{plan.description}</div>}
                    <div className="text-sm text-gray-600 mt-1">
                      {plan.hours < 1
                        ? `${plan.hours * 60} minutes`
                        : plan.hours === 1
                          ? "1 hour"
                          : plan.hours < 24
                            ? `${plan.hours} hours`
                            : `${plan.hours / 24} days`}
                      {plan.dataCapGB && ` • ${plan.dataCapGB}GB data`}
                    </div>
                  </div>
                  {plan.price === 0 ? (
                    <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-medium">
                      FREE
                    </span>
                  ) : (
                    <span className="text-xl font-bold text-gray-800">KSh {plan.price}</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {selectedPlan && selectedPlan.price > 0 && (
            <div className="bg-gray-50 rounded-xl p-6 mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Smartphone className="w-4 h-4 inline mr-1" />
                M-Pesa Phone Number
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                placeholder="254712345678"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-2">Format: 254XXXXXXXXX</p>
            </div>
          )}

          <button
            onClick={handlePayment}
            disabled={!selectedPlan || processing}
            className={`w-full py-4 rounded-xl font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              selectedPlan?.price === 0
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                : "bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
            }`}>
            {processing ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </span>
            ) : selectedPlan ? (
              selectedPlan.price === 0 ? (
                "Get Free Access"
              ) : (
                `Pay KSh ${selectedPlan.price} via M-Pesa`
              )
            ) : (
              "Select a Plan Above"
            )}
          </button>

          <div className="mt-6 text-center text-sm text-gray-500">
            <Globe className="w-4 h-4 inline mr-1" />
            Powered by Hotspot System
          </div>
        </div>
      </div>
    </div>
  );
}

export default Portal;
