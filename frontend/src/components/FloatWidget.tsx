import { useState } from "react";
import { Clock } from "lucide-react";

interface FloatingTimerProps {
  timeLeft: number;
  onUpgrade: () => void;
}

const FloatingTimer: React.FC<FloatingTimerProps> = ({
  timeLeft,
  onUpgrade,
}) => {
  const [minimized, setMinimized] = useState(false);

  if (minimized) {
    return (
      <div
        className="floating-timer minimized"
        onClick={() => setMinimized(false)}
      >
        <Clock size={16} />
        <span>{Math.floor(timeLeft / 60)}m</span>
      </div>
    );
  }

  return (
    <div className="floating-timer">
      <div className="timer-header">
        <span>Free Trial</span>
        <button onClick={() => setMinimized(true)} className="minimize-btn">
          −
        </button>
      </div>
      <div className="timer-body">
        <div className="time-display">
          {Math.floor(timeLeft / 60)}:
          {(timeLeft % 60).toString().padStart(2, "0")}
        </div>
        <button onClick={onUpgrade} className="upgrade-btn">
          Upgrade Now
        </button>
      </div>
    </div>
  );
};

export default FloatingTimer;
