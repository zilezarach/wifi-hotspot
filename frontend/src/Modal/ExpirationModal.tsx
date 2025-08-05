import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useCallback } from "react";

interface ExpirationModalProps {
  onPurchase: () => void;
  onDisconnect: () => void;
  onExtend: () => void;
  isExtending?: boolean;
  isDisconnecting?: boolean;
}

const ExpirationModal: React.FC<ExpirationModalProps> = ({
  onPurchase,
  onDisconnect,
  onExtend,
  isExtending = false,
  isDisconnecting = false,
}) => {
  // Handle ESC key press
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isExtending && !isDisconnecting) {
        onDisconnect();
      }
    },
    [onDisconnect, isExtending, isDisconnecting]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);

    // Prevent background scrolling
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [handleKeyDown]);

  // Prevent modal close when actions are in progress
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isExtending && !isDisconnecting) {
      onDisconnect();
    }
  };

  return (
    <div
      className="modal-overlay fixed"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
    >
      <div className="expiration-modal">
        <div className="modal-header">
          <AlertCircle size={48} color="#ef4444" aria-hidden="true" />
          <h2 id="modal-title">Free Trial Expired</h2>
          <p id="modal-description">
            Your 30-minute free internet session has ended. Choose how you'd
            like to continue.
          </p>
        </div>

        <div className="options-grid">
          <div className="option-card primary">
            <h3>Purchase a Plan</h3>
            <p>
              Get unlimited access with our affordable plans starting from KSh
              10
            </p>
            <button
              onClick={onPurchase}
              className="option-btn primary"
              disabled={isExtending || isDisconnecting}
              aria-label="View available internet plans"
            >
              View Plans
            </button>
          </div>

          <div className="option-card secondary">
            <h3>Extend Free Trial</h3>
            <p>Get another 30 minutes of free access (limited per device)</p>
            <button
              onClick={onExtend}
              className="option-btn secondary"
              disabled={isExtending || isDisconnecting}
              aria-label="Extend free trial for 30 more minutes"
            >
              {isExtending ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Extending...
                </>
              ) : (
                "Extend Trial"
              )}
            </button>
          </div>

          <div className="option-card tertiary">
            <h3>Disconnect</h3>
            <p>End session and return to device settings</p>
            <button
              onClick={onDisconnect}
              className="option-btn tertiary"
              disabled={isExtending || isDisconnecting}
              aria-label="Disconnect from WiFi hotspot"
            >
              {isDisconnecting ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Disconnecting...
                </>
              ) : (
                "Disconnect"
              )}
            </button>
          </div>
        </div>

        {/* Progress indicator when extending */}
        {isExtending && (
          <div className="modal-progress">
            <div className="progress-bar">
              <div className="progress-fill animate-pulse"></div>
            </div>
            <p className="progress-text">
              Setting up your extended trial session...
            </p>
          </div>
        )}

        {/* Helpful tips */}
        <div className="modal-tips">
          <div className="tip">
            <strong>💡 Tip:</strong> Purchase a plan for uninterrupted browsing
            and faster speeds
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpirationModal;
