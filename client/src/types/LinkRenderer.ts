import type { ReactNode } from 'react';

// Draws a Markdown link whose target isn't a web or mail address, such as another help page.
// Returning null shows the link's label as plain text.
type LinkRenderer = (href: string, label: string, key: string) => ReactNode | null;

export default LinkRenderer;
