// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AgentRegistry
/// @notice Public directory of agents, their endpoints, and payment wallets.
/// @dev The registering account owns the entry. Payment wallets are not verified.
contract AgentRegistry {
    struct Agent {
        string name;
        address wallet;
        address owner;
        string description;
        string endpointUrl;
        bool active;
    }

    Agent[] public agents;
    uint256 public activeAgentCount;

    event AgentAdded(uint256 indexed agentId, string name, address indexed wallet);
    event AgentUpdated(uint256 indexed agentId);
    event AgentStatusChanged(uint256 indexed agentId, bool active);

    modifier onlyAgentOwner(uint256 agentId) {
        require(agentId < agents.length, "Agent does not exist");
        require(agents[agentId].owner == msg.sender, "Only agent owner");
        _;
    }

    /// @notice Add an agent. IDs start at zero; duplicate entries are allowed.
    function addAgent(string calldata name, address wallet) external returns (uint256 agentId) {
        return _addAgent(name, wallet, "", "");
    }

    /// @notice Register an agent with directory details. Endpoints are informational.
    function addAgentWithDetails(
        string calldata name,
        address wallet,
        string calldata description,
        string calldata endpointUrl
    ) external returns (uint256 agentId) {
        return _addAgent(name, wallet, description, endpointUrl);
    }

    /// @notice Update directory details and the payment wallet; ownership stays unchanged.
    function updateAgent(
        uint256 agentId,
        string calldata name,
        address wallet,
        string calldata description,
        string calldata endpointUrl
    ) external onlyAgentOwner(agentId) {
        _validate(name, wallet, description, endpointUrl);
        Agent storage agent = agents[agentId];
        agent.name = name;
        agent.wallet = wallet;
        agent.description = description;
        agent.endpointUrl = endpointUrl;
        emit AgentUpdated(agentId);
    }

    /// @notice Deactivate or reactivate an entry without deleting its stable ID.
    function setAgentActive(uint256 agentId, bool active) external onlyAgentOwner(agentId) {
        Agent storage agent = agents[agentId];
        require(agent.active != active, "Status is unchanged");
        agent.active = active;
        if (active) activeAgentCount += 1;
        else activeAgentCount -= 1;
        emit AgentStatusChanged(agentId, active);
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        require(agentId < agents.length, "Agent does not exist");
        return agents[agentId];
    }

    /// @notice Read up to 100 entries, including inactive entries.
    /// @dev Each result's ID is offset + its array index. Past-the-end pages are empty.
    function getAgents(uint256 offset, uint256 limit) external view returns (Agent[] memory page) {
        require(limit > 0 && limit <= 100, "Limit must be 1 to 100");
        if (offset >= agents.length) return new Agent[](0);
        uint256 count = agents.length - offset;
        if (count > limit) count = limit;
        page = new Agent[](count);
        for (uint256 i = 0; i < count; i++) {
            page[i] = agents[offset + i];
        }
    }

    /// @notice Return the number of registered agents.
    function getAgentCount() external view returns (uint256) {
        return agents.length;
    }

    function _addAgent(
        string memory name,
        address wallet,
        string memory description,
        string memory endpointUrl
    ) private returns (uint256 agentId) {
        _validate(name, wallet, description, endpointUrl);
        agentId = agents.length;
        agents.push(Agent(name, wallet, msg.sender, description, endpointUrl, true));
        activeAgentCount += 1;
        emit AgentAdded(agentId, name, wallet);
    }

    function _validate(
        string memory name,
        address wallet,
        string memory description,
        string memory endpointUrl
    ) private pure {
        require(bytes(name).length > 0 && bytes(name).length <= 128, "Name must be 1 to 128 bytes");
        require(wallet != address(0), "Wallet cannot be zero");
        require(bytes(description).length <= 2048, "Description exceeds 2048 bytes");
        require(bytes(endpointUrl).length <= 512, "Endpoint exceeds 512 bytes");
    }
}
