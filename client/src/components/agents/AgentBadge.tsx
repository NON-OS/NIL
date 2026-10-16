import './Agents.css';

// Marks an AI teammate wherever people are listed, so nobody mistakes an agent for a person.
export default function AgentBadge() {
  return (
    <span className="agent-badge" title="An AI agent, not a person">
      Agent
    </span>
  );
}
