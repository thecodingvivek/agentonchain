import { groq } from "@ai-sdk/groq";
import { defineAgent } from "eve";

export default defineAgent({
  model: groq(process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b"),
  modelContextWindowTokens: 131_072,
  defaultTools: false,
});
