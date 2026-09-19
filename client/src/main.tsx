import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// KaTeX ships the fonts and metrics that the notes preview and PDF need.
import "katex/dist/katex.min.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);