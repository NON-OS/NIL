// What keeps the relay from reading a browser-to-browser call from its traffic: sound asked
// for at a constant bitrate and padded to one size, so every packet is the same size whether
// anyone is speaking, and video padded to a few sizes (framePad.worker). Firefox and Safari run the worker as a script
// transform on each sender and receiver; Chrome hands it each one's streams.

type Endpoint = RTCRtpSender | RTCRtpReceiver;
const Script = typeof RTCRtpScriptTransform === 'undefined' ? null : RTCRtpScriptTransform;
const streamsApi = !Script && typeof RTCRtpSender !== 'undefined' && 'createEncodedStreams' in RTCRtpSender.prototype;
const done = new WeakSet<Endpoint>();
let worker: Worker | null = null;
let count = 0;

const work = () => (worker ??= new Worker(new URL('../../lib/calls/framePad.worker.ts', import.meta.url), { type: 'module' }));

function transform(endpoint: Endpoint, side: 'send' | 'receive', id: string, audio: boolean) {
  if (done.has(endpoint)) return;
  done.add(endpoint);
  if (Script) {
    endpoint.transform = new Script(work(), { side, id, audio });
    return;
  }
  const { readable, writable } = (endpoint as Endpoint & { createEncodedStreams: () => { readable: ReadableStream; writable: WritableStream } }).createEncodedStreams();
  work().postMessage({ kind: 'streams', side, id, audio, readable, writable }, [readable as unknown as Transferable, writable as unknown as Transferable]);
}

// VP8 first, which every browser has and which padding can't upset (see framePad.worker)
function preferVp8(t: RTCRtpTransceiver) {
  const codecs = typeof RTCRtpReceiver !== 'undefined' && RTCRtpReceiver.getCapabilities?.('video')?.codecs;
  if (!codecs || !t.setCodecPreferences) return;
  const vp8 = codecs.filter((c) => /vp8/i.test(c.mimeType));
  try {
    t.setCodecPreferences([...vp8, ...codecs.filter((c) => !vp8.includes(c))]);
  } catch {}
}

const meshShaping = {
  supported: Boolean(Script || streamsApi),

  // Chrome only hands out a connection's streams when it's made asking for them
  config: (): RTCConfiguration => (streamsApi ? ({ encodedInsertableStreams: true } as RTCConfiguration) : {}),

  // every slot of a connection through the worker; the names of its senders, to pad
  attach(pc: RTCPeerConnection): string[] {
    if (!meshShaping.supported) return [];
    const senders: string[] = [];
    pc.getTransceivers()
      .slice(0, 3)
      .forEach((t, i) => {
        const id = `${++count}`;
        if (i > 0) preferVp8(t);
        if (!done.has(t.sender)) senders.push(id);
        transform(t.sender, 'send', id, i === 0);
        transform(t.receiver, 'receive', id, i === 0);
      });
    return senders;
  },

  pad(ids: string[]) {
    for (const id of ids) work().postMessage({ kind: 'pad', id, on: true });
  },

  // a description asking for sound at a constant bitrate, never paused for silence
  constantSound(sdp: string): string {
    const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
    if (!pt) return sdp;
    return sdp.replace(new RegExp(`(a=fmtp:${pt} [^\\r\\n]*)`), (line) => line.replace(/;?(cbr|usedtx)=\d/g, '') + ';cbr=1;usedtx=0');
  },
};

export default meshShaping;
