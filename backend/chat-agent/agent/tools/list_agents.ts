import { defineTool } from "eve/tools";
import { z } from "zod";
import { registeredAgents } from "../../../payments/agent-registry";

export default defineTool({
  description: "List all agents registered in this backend project, with their names, descriptions, skills, and query endpoints and payment requirements. Registration does not confirm that a server is running. Browser-only custom cards are not backend registrations.",
  inputSchema: z.object({}),
  execute() {
    const agents = registeredAgents;
    return { agents, total: agents.length, availability: "Registered agents; server availability has not been checked." };
  },
});
