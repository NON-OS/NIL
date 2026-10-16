"""The OpenAI Agents SDK example from docs/ai-agents.md, unchanged except that the agent runs on
the local OpenAI-compatible model instead of OpenAI's default.

    NIL=http://127.0.0.1:3917/api/agent/v1 NIL_AGENT_KEY=... LOCAL_MODEL=local-agent python openaiAgents.py
"""
import os
import requests
from agents import Agent, Runner, function_tool
from agents import OpenAIChatCompletionsModel, set_tracing_disabled
from openai import AsyncOpenAI

NIL = os.environ.get("NIL", "https://nil.example.com/api/agent/v1")
HEADERS = {"Authorization": f"Bearer {os.environ['NIL_AGENT_KEY']}"}


@function_tool
def my_assignments() -> dict:
    """Tasks assigned to me in Nil, most urgent first."""
    return requests.get(f"{NIL}/me/assignments", headers=HEADERS, timeout=30).json()


@function_tool
def get_task(key: str) -> dict:
    """Read a Nil task by key, like NON-12, with its checklist and comments."""
    return requests.get(f"{NIL}/tasks/{key}", headers=HEADERS, timeout=30).json()


@function_tool
def add_comment(key: str, text: str) -> dict:
    """Post a comment on a Nil task."""
    return requests.post(f"{NIL}/tasks/{key}/comments", json={"text": text}, headers=HEADERS, timeout=30).json()


# the only change: a local model instead of OpenAI's
set_tracing_disabled(True)
local = OpenAIChatCompletionsModel(
    model=os.environ.get("LOCAL_MODEL", "local-agent"),
    openai_client=AsyncOpenAI(base_url=os.environ.get("LOCAL_MODEL_URL", "http://127.0.0.1:11434/v1"), api_key="unused"),
)

agent = Agent(
    name="Nil helper",
    instructions="You work on tasks in Nil. Read a task before you comment on it.",
    tools=[my_assignments, get_task, add_comment],
    model=local,
)
result = Runner.run_sync(agent, "Look at my most urgent assignment and comment with a plan.")
print(result.final_output)
for item in result.new_items:
    if item.type == "tool_call_item":
        print("tool call:", item.raw_item.name, item.raw_item.arguments)
