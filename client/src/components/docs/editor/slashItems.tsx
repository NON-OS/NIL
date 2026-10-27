import { CheckSquare, Code2, FileUp, Heading1, Heading2, Heading3, ImagePlus, List, ListOrdered, Minus, Quote, Table, Text } from 'lucide-react';
import type { Editor, Range } from '@tiptap/core';
import type { ReactNode } from 'react';

export interface SlashItem {
  id: string;
  label: string;
  keywords: string;
  icon: ReactNode;
  run: (editor: Editor, range: Range) => void;
}

const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

// The blocks / can add. Images and files open the file picker through the editor's own handler.
const slashItems = (pick: (kind: 'image' | 'file') => void): SlashItem[] => [
  { id: 'text', label: 'Text', keywords: 'paragraph plain', icon: <Text />, run: (e, r) => chain(e, r).setParagraph().run() },
  { id: 'h1', label: 'Heading 1', keywords: 'title big', icon: <Heading1 />, run: (e, r) => chain(e, r).setHeading({ level: 1 }).run() },
  { id: 'h2', label: 'Heading 2', keywords: 'subtitle', icon: <Heading2 />, run: (e, r) => chain(e, r).setHeading({ level: 2 }).run() },
  { id: 'h3', label: 'Heading 3', keywords: 'small', icon: <Heading3 />, run: (e, r) => chain(e, r).setHeading({ level: 3 }).run() },
  { id: 'bullets', label: 'Bulleted list', keywords: 'ul unordered', icon: <List />, run: (e, r) => chain(e, r).toggleBulletList().run() },
  { id: 'numbers', label: 'Numbered list', keywords: 'ol ordered', icon: <ListOrdered />, run: (e, r) => chain(e, r).toggleOrderedList().run() },
  { id: 'todo', label: 'To-do list', keywords: 'task check', icon: <CheckSquare />, run: (e, r) => chain(e, r).toggleTaskList().run() },
  { id: 'quote', label: 'Quote', keywords: 'blockquote', icon: <Quote />, run: (e, r) => chain(e, r).toggleBlockquote().run() },
  { id: 'code', label: 'Code block', keywords: 'snippet pre', icon: <Code2 />, run: (e, r) => chain(e, r).toggleCodeBlock().run() },
  { id: 'table', label: 'Table', keywords: 'grid rows columns', icon: <Table />, run: (e, r) => chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: 'rule', label: 'Divider', keywords: 'hr line separator', icon: <Minus />, run: (e, r) => chain(e, r).setHorizontalRule().run() },
  { id: 'image', label: 'Image', keywords: 'picture photo', icon: <ImagePlus />, run: (e, r) => (chain(e, r).run(), pick('image')) },
  { id: 'file', label: 'File', keywords: 'pdf word attach upload', icon: <FileUp />, run: (e, r) => (chain(e, r).run(), pick('file')) },
];

export default slashItems;
