import { AlertCircle, Wifi, Clock } from "lucide-react";

interface WelcomeModalProps {
  onAccept: () => void;
  onDecline: () => void;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ onAccept, onDecline }) => {
  return (
    <div className="modal-overlay">
      <div className="welcome-modal">
        <div className="modal-header">
          <Wifi size={48} color="#4ade80" />
          <h2>Welcome to Zile WiFi Hotspot!</h2>
        </div>

        <div className="trial-info">
          <div className="feature-list">
            <div className="feature-item">
              <Clock size={20} />
              <span>30 minutes of Free Internet</span>
            </div>
            <div className="feature-item">
              <Wifi size={20} />
              <span>High-Speed Connection</span>
            </div>
            <div className="feature-item">
              <AlertCircle size={20} />
              <span>No Registration Required</span>
            </div>
          </div>

          <div className="upgrade-hint">
            <p>Want unlimited access? Purchase a plan after your free trial!</p>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onAccept} className="accept-btn">
            Start Free Trial
          </button>
          <button onClick={onDecline} className="decline-btn">
            View Plans
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;
