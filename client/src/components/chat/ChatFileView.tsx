import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import chatFiles from '../../actions/chat/chatFiles';
import saveBlob from '../../lib/saveBlob';
import formatBytes from '../../lib/formatBytes';
import type ChatFile from '../../types/ChatFile';

// image types an <img> shows without any way to run script, so never SVG
const PICTURE = /^image\/(png|jpeg|gif|webp)$/;

// A file in a message: pictures show inline once decrypted in this tab, anything else is a chip
// that saves it. Either way the bytes have to be the ones the sender signed.
export default function ChatFileView({ channelId, file }: { channelId: string; file: ChatFile }) {
  const picture = PICTURE.test(file.type);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!picture || !file.key) return;
    let live = true;
    let made: string | null = null;
    chatFiles
      .open(channelId, file)
      .then((bytes) => {
        if (!live) return;
        made = URL.createObjectURL(new Blob([bytes], { type: file.type }));
        setUrl(made);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [picture, channelId, file.id, file.key]);

  const save = async () => {
    setBusy(true);
    try {
      saveBlob(new Blob([await chatFiles.open(channelId, file)], { type: 'application/octet-stream' }), file.name);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (picture && url) {
    return (
      <button type="button" className="chat-image-box" onClick={save} title={`Save ${file.name}`} aria-label={`Picture ${file.name}. Save it`}>
        <img className="chat-image" src={url} alt={file.name} />
      </button>
    );
  }
  return (
    <button type="button" className="chat-file" onClick={save} disabled={!file.key || busy} aria-label={`Save ${file.name}, ${formatBytes(file.size)}`}>
      {busy ? <Spinner size={14} /> : picture ? <Download size={15} /> : <FileText size={15} />}
      <span>{file.name}</span>
      <small>{formatBytes(file.size)}</small>
    </button>
  );
}
