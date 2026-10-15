# Local agent directory

`agents.json` is generated here whenever Deploy opens or **Refresh agents** succeeds. It contains the complete on-chain directory, including inactive entries, plus the contract, chain, block number, and refresh timestamp. The generated file is ignored by Git.

The backend fetches every contract page at the same block, then atomically replaces the file. Failed or incomplete fetches preserve the previous snapshot. UI pagination reads this saved snapshot. Chat agent's `list_agents` tool rereads this same file on every invocation and returns active entries with the snapshot timestamp. It does not use the static paid-agent allowlist as a fallback.

Set `CONTRACT_ADDRESS` in `backend/.env.local` and restart Chat agent before refreshing Deploy. Optional `AGENT_REGISTRY_CACHE_FILE` overrides the default path; use an absolute path. The file holds public directory data only. Entry status does not verify server uptime, and listing an entry does not authorize payments to it.
