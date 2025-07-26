import PaymentForm from "./components/PaymentForm";
import { Wifi, Shield, Zap, CreditCard } from "lucide-react";

function App() {
  return (
    <div className="app">
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

      {/* Footer */}
      <div className="footer">
        <p>Powered by Zile and M-Pesa</p>
      </div>
    </div>
  );
}

export default App;
