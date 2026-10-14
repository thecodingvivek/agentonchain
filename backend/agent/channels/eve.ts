import { eveChannel } from "eve/channels/eve";

// Paid queries enter via /mcp. Keep health checks but reject free session access.
export default eveChannel({ auth: () => null });
