import { createRoot } from "react-dom/client";
import App from "./App";
import { dismissSplash } from "./lib/splash";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
dismissSplash();
