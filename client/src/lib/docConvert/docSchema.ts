import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import docNodes from '../../components/docs/editor/docNodes';

let schema: Schema | null = null;

// The editor's schema, built once. Imports are parsed and checked against it, so a converter can
// only ever hand the editor something it could have made itself.
export default function docSchema() {
  schema ??= getSchema(docNodes());
  return schema;
}
