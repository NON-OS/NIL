import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import docNodes from '../../components/docs/editor/docNodes';

let schema: Schema | null = null;

// The ProseMirror schema of a doc, built once from the same list the editor uses.
export default function docSchema() {
  schema ??= getSchema(docNodes());
  return schema;
}
