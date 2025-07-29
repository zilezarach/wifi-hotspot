import { AlertCircle } from "lucide-react";

interface ExpirationModalProps {
  onPurchase: () => void;
  onDisconnect: () => void;
  onExtend: () => void;
}
const ExpirationModal: React.FC<ExpirationModalProps> = ({
  onPurchase,
  onDisconnect,
  onExtend,
}) => {
  return (
    <div className="modal-overlay fixed">
      <div className="expiration-modal">
        <div className="modal-header">
          <AlertCircle size={48} color="#ef4444" />
          <h2>Free Trial Expired</h2>
          <p>Your 30-minute free internet session has ended.</p>
        </div>

        <div className="options-grid">
          <div className="option-card primary">
            <h3>Purchase a Plan</h3>
            <p>Get unlimited access with our affordable plans</p>
            <button onClick={onPurchase} className="option-btn primary">
              View Plans
            </button>
          </div>

          <div className="option-card secondary">
            <h3>Continue with Limited Access</h3>
            <p>Access essential websites only</p>
            <button onClick={onExtend} className="option-btn secondary">
              Essential Mode
            </button>
          </div>

          <div className="option-card">
            <h3>Disconnect</h3>
            <p>Return to device settings</p>
            <button onClick={onDisconnect} className="option-btn">
              Disconnect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpirationModal;
