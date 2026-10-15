import { defineTool } from "eve/tools";
import { z } from "zod";
import { listCachedAgents } from "../../../registry/agent-cache";

export default defineTool({
  description: "List active agents from the same local JSON directory saved when Deploy fetches or refreshes the on-chain registry. Returns names, descriptions, wallets, endpoints, and snapshot time. Inactive entries are excluded. Registry data does not verify server uptime, identity, price, or authorization for paid invocation. If the file is missing, ask the user to refresh Deploy.",
  inputSchema: z.object({}),
  execute() {
    return listCachedAgents();
  },
});
