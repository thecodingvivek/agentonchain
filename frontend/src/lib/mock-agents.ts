/** Frontend registration for the primary backend agent. */
export type MockAgent = {
  id: string;
  source: "mock" | "local" | "custom";
  name: string;
  description: string;
  developer: string;
  skills: string[];
  endpointUrl: string;
  pricing: { currency: "USD"; inputPerToken: number; outputPerToken: number } | null;
  rating: number | null;
  reviewCount: number;
  status: "deployed" | "available" | "local";
  identity: { kind: "mock-erc8004"; agentId: string } | { kind: "local" };
  paymentMode: "mock-endpoint" | "none";
};

export const exploreAgents: MockAgent[] = [
  {
    id: "agentonchain-assistant",
    source: "local",
    name: "Agentonchain assistant",
    description: "A general-purpose Groq agent that answers questions clearly, with examples and explanations when helpful.",
    developer: "Demo user",
    skills: ["General questions", "Explanations", "Groq"],
    endpointUrl: "http://127.0.0.1:2000/eve/v1/session",
    pricing: null,
    rating: null,
    reviewCount: 0,
    status: "local",
    identity: { kind: "local" },
    paymentMode: "none",
  },
];

export function searchMockAgents(agents: MockAgent[], query: string): MockAgent[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return agents.filter((agent) => {
    const searchable = [agent.name, agent.description, agent.developer, ...agent.skills].join(" ").toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}
