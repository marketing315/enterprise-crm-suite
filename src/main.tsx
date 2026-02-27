import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Suppress harmless AbortError rejections (React Query signal cancellations)
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  if (
    reason instanceof DOMException && reason.name === "AbortError" ||
    (typeof reason === "object" && reason !== null && Object.keys(reason).length === 0)
  ) {
    event.preventDefault();
    return;
  }
});

createRoot(document.getElementById("root")!).render(<App />);
