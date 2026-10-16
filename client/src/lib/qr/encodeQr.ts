import qrCodewords from './qrCodewords';
import qrMatrix from './qrMatrix';

// Text as a QR code (UTF-8, byte mode, error correction level M), drawn entirely in the
// browser so a payment link never goes to a third-party service. Rows of modules, true = dark.
export default function encodeQr(text: string, forceMask?: number): boolean[][] {
  const { version, codewords } = qrCodewords(new TextEncoder().encode(text));
  return qrMatrix(version, codewords, forceMask);
}
