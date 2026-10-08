import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import StandaloneBookReader from "./StandaloneBookReader.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).has("readerBook")
      ? <StandaloneBookReader params={new URLSearchParams(window.location.search)} /> : <App />}
  </React.StrictMode>
);
