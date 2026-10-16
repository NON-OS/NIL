"""The LangChain tools from docs/ai-agents.md, unchanged, run through the agent constructor the
docs name (langgraph.prebuilt.create_react_agent) and the one LangChain 1.x recommends
(langchain.agents.create_agent), on the local model.

    NIL=http://127.0.0.1:3917/api/agent/v1 NIL_AGENT_KEY=... LOCAL_MODEL=local-agent python langchainAgent.py [prebuilt|create_agent]
"""
import os
import sys
import warnings
import requests
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

NIL = os.environ.get("NIL", "https://nil.example.com/api/agent/v1")
HEADERS = {"Authorization": f"Bearer {os.environ['NIL_AGENT_KEY']}"}


@tool
def search_tasks(query: str) -> dict:
    """Search Nil tasks by words in their title or description."""
    return requests.get(f"{NIL}/tasks/search", params={"query": query}, headers=HEADERS, timeout=30).json()


@tool
def claim_task(key: str) -> dict:
    """Take an unassigned Nil task and start it."""
    return requests.post(f"{NIL}/tasks/{key}/claim", headers=HEADERS, timeout=30).json()


model = ChatOpenAI(model=os.environ.get("LOCAL_MODEL", "local-agent"), base_url=os.environ.get("LOCAL_MODEL_URL", "http://127.0.0.1:11434/v1"), api_key="unused", temperature=0.2)
question = {"messages": [{"role": "user", "content": "Find the task about the FAQ for the launch and claim it."}]}

which = sys.argv[1] if len(sys.argv) > 1 else "prebuilt"
with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter("always")
    if which == "prebuilt":
        from langgraph.prebuilt import create_react_agent
        agent = create_react_agent(model, [search_tasks, claim_task])
    else:
        from langchain.agents import create_agent
        agent = create_agent(model, [search_tasks, claim_task])
for w in caught:
    if issubclass(w.category, DeprecationWarning) or "deprecat" in str(w.message).lower():
        print(f"WARNING ({w.category.__name__}): {w.message}")

result = agent.invoke(question)
for m in result["messages"]:
    calls = getattr(m, "tool_calls", None)
    if calls:
        print("tool call:", [(c["name"], c["args"]) for c in calls])
print("final:", result["messages"][-1].content[:300])
