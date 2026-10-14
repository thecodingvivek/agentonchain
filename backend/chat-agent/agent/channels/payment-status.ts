import { defineChannel, GET } from "eve/channels";
import { buyerStatus } from "../../../payments/paid-buyer";

export default defineChannel({ routes: [GET("/payments/wallet", async () => Response.json(buyerStatus(), { headers: { "Cache-Control": "no-store" } }))] });
