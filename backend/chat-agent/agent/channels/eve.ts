import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";
import { parseBuyerWallet } from "../../../payments/paid-buyer";

export default eveChannel({
  auth: [vercelOidc(), localDev()],
  onMessage({ eve }) {
    const serialized = eve.request.headers.get("x-payment-wallet");
    let paymentWallet = "";
    if (serialized && serialized.length < 1000) {
      try { paymentWallet = JSON.stringify(parseBuyerWallet(JSON.parse(serialized))); } catch { /* Invalid or absent cards never authorize spending. */ }
    }
    return { auth: eve.caller ? { ...eve.caller, attributes: { ...eve.caller.attributes, paymentWallet } } : null };
  },
});
