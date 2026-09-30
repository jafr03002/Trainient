import { createRoot } from "react-dom/client";
import App from "./App";
import { dismissSplashEventually } from "./lib/splash";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
dismissSplashEventually();
