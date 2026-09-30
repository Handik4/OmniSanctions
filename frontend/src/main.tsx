import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// u256 arguments travel as bigint; teach JSON to serialise them (wallet / RPC envelopes).
const proto = BigInt.prototype as unknown as { toJSON?: () => string };
if (typeof proto.toJSON !== "function") proto.toJSON = function (this: bigint) { return this.toString(); };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
