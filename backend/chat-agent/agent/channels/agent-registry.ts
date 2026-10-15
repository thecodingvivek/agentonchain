import { defineChannel, GET } from "eve/channels";
import { parseOffset, registryPage, RegistryError } from "../../../registry/agent-registry";
import { readAgentCache, refreshAgentCache } from "../../../registry/agent-cache";

export default defineChannel({
  routes: [GET("/registry/agents", async (request) => {
    try {
      const offset = parseOffset(new URL(request.url).searchParams.get("offset"));
      const snapshot = offset === 0n ? await refreshAgentCache() : await readAgentCache();
      return Response.json(registryPage(snapshot, offset), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return Response.json({ error: error instanceof RegistryError ? error.message : "The registry is unavailable." }, {
        status: error instanceof RegistryError ? error.status : 502,
        headers: { "Cache-Control": "no-store" },
      });
    }
  })],
});
