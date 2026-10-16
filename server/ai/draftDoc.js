import ask from './ask.js';

// Writes or extends a doc in Markdown. The doc itself is end-to-end encrypted, so the browser
// only sends this when the person asks, and nothing here is stored.
export default async function draftDoc({ instruction, title, context }) {
  return ask({
    effort: 'medium',
    prompt: `Write Markdown for a team document${title ? ` titled “${title}”` : ''}. Follow the instruction exactly. Plain, factual, specific; use headings, short paragraphs and lists where they help. Don't repeat the existing text, don't add a title line, and don't invent names, numbers or decisions that aren't given.

<instruction>
${instruction}
</instruction>${context ? `\n\n<existing_doc>\n${context}\n</existing_doc>` : ''}`,
  });
}
