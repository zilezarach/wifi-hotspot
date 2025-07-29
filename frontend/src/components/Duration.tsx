import { useState, useEffect } from "react";
import { Clock, AlertCircle } from "lucide-react";

interface FreeDurationTimerProps {
  duration?: number;
  onExpired: () => void;
}

const FreeDurationTimer: React.FC<FreeDurationTimerProps> = ({
  duration = 10080,
  onExpired,
}) => {
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  const [showWarning, setShowWarning] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 60 && !showWarning) {
          setShowWarning(true);
        }
        if (prev <= 0) {
          clearInterval(timer);
          onExpired();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onExpired, showWarning]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  return (
    <div className={`timer-widget ${showWarning ? "warning" : ""}`}>
      <div className="timer-content">
        <Clock size={20} />
        <span className="timer-text">Free Time Remaining</span>
        <span className="timer-display">{formatTime(timeLeft)}</span>
      </div>
      {showWarning && (
        <div className="timer-warning">
          <AlertCircle size={16} />
          Less than 1 minute left!
        </div>
      )}
    </div>
  );
};

export default FreeDurationTimer;
