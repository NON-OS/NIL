const DONE = {
  type: 'array',
  maxItems: 50,
  description: 'Checklist items you have finished in this run. For each, the item id and the result: what you produced for it (the text itself, the plan, the answer, or what your tool calls changed). Items without a real result stay open.',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The checklist item id' },
      result: { type: 'string', minLength: 1, maxLength: 4000, description: 'What you produced for this item' },
    },
    required: ['id', 'result'],
    additionalProperties: false,
  },
};

// The tools as a built-in agent sees them. They are the shared tools, except that update_task
// ticks checklist items with checklistDone, which carries what was produced for each item, instead
// of checklistTick. The runner checks those results before anything is ticked.
export default function runnerTools(tools) {
  return tools.map((tool) => {
    if (tool.name !== 'update_task') return tool;
    const { checklistTick, ...properties } = tool.inputSchema.properties;
    return {
      ...tool,
      description: `${tool.description} To tick checklist items, use checklistDone with the result for each item.`,
      inputSchema: { ...tool.inputSchema, properties: { ...properties, checklistDone: DONE } },
    };
  });
}
