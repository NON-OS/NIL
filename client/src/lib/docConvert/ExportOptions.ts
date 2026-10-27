import type SealedImageAttrs from './SealedImageAttrs';

// An image opened from its sealed blob, with its size in pixels.
export interface OpenedImage {
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
}

// What the Word and Markdown exports ask of the editor: the bytes behind an image, and the name
// to print for a mentioned person.
export default interface ExportOptions {
  readImage: (attrs: SealedImageAttrs) => Promise<OpenedImage>;
  people: (userId: string) => string;
}
