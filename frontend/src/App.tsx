import { useState, useEffect } from "react";
import Portal from "./components/Portal";
import AdminDashboard from "./components/AdminDashboard";

function App() {
  const [view, setView] = useState<"portal" | "admin">("portal");

  useEffect(() => {
    // Determine view based on URL path
    const path = window.location.pathname;
    if (path.startsWith("/admin")) {
      setView("admin");
    } else {
      setView("portal");
    }
  }, []);

  return <div className="min-h-screen bg-gray-50">{view === "admin" ? <AdminDashboard /> : <Portal />}</div>;
}

export default App;
