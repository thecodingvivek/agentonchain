import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "List all agents registered in this backend project, with their names, descriptions, skills, and query endpoints and payment requirements. Registration does not confirm that a server is running. Browser-only custom cards are not backend registrations.",
  inputSchema: z.object({}),
  execute() {
    const agents = [
      {
        id: "agentonchain-assistant",
        name: "Agentonchain assistant",
        description: "Answers general questions with clear explanations and examples.",
        skills: ["General questions", "Explanations"],
        endpointUrl: "http://127.0.0.1:2000/mcp",
        transport: "MCP",
        tool: "ask_agent",
        payment: { currency: "USDC", pricePerCall: "0.01", network: "base-sepolia" },
      },
      {
        id: "everyday-helper",
        name: "Everyday helper",
        description: "Answers everyday questions and provides practical step-by-step help.",
        skills: ["General questions", "Everyday help"],
        endpointUrl: "http://127.0.0.1:2001/mcp",
        transport: "MCP",
        tool: "ask_agent",
        payment: { currency: "USDC", pricePerCall: "0.01", network: "base-sepolia" },
      },
      {
        id: "chat-agent",
        name: "Chat agent",
        description: "Answers conversational queries, remembers follow-ups, and lists registered agents.",
        skills: ["Conversation", "General questions", "Agent discovery"],
        endpointUrl: "http://127.0.0.1:2002/eve/v1/session",
        transport: "eve HTTP",
        payment: null,
      },
    ];
    return { agents, total: agents.length, availability: "Registered agents; server availability has not been checked." };
  },
});
