/** Trusted seller registry; tool callers cannot supply endpoints. */
export const registeredAgents = [
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
    description: "Answers conversational queries, lists agents, and invokes user-selected paid agents with the configured buyer wallet.",
    skills: ["Conversation", "Agent discovery", "Paid agent delegation"],
    endpointUrl: "http://127.0.0.1:2002/eve/v1/session",
    transport: "eve HTTP",
    payment: null,
  },
];
