// What a sealedImage node holds: the encrypted blob, the key that opens it and what the editor
// shows about it. Never a URL, so a doc can't load an image from anywhere else.
export default interface SealedImageAttrs {
  blob: string;
  key: string;
  mime: string;
  name: string;
  width: number | null;
  height: number | null;
  alt: string;
}
