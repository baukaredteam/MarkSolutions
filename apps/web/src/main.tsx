import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./app";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(<App />);
}
