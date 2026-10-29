import { useEffect, useState } from 'react';
import { CameraOff, TriangleAlert } from 'lucide-react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import VideoView from './VideoView';
import useCallStore from '../../state/useCallStore';
import callStore from '../../state/callStore';
import toast from '../../state/toast';
import localMedia from '../../actions/calls/localMedia';
import callMedia from '../../actions/calls/callMedia';
import callSession from '../../actions/calls/callSession';
import audioLevels from '../../actions/calls/audioLevels';

type Devices = Awaited<ReturnType<typeof localMedia.devices>>;

// Picks the microphone, camera and speaker, with a preview of the camera and a meter for the
// microphone. Before joining a project call it's the last step; in a call it changes devices
// on the spot.
export default function DeviceCheck() {
  const join = useCallStore((s) => s.devices.join);
  const inCall = useCallStore((s) => s.active);
  const [devices, setDevices] = useState<Devices>({ mics: [], cams: [], speakers: [] });
  const [prefs, setPrefs] = useState(localMedia.prefs);
  const [video, setVideo] = useState(join?.video ?? false);
  const [preview, setPreview] = useState<MediaStream | null>(null);
  const [level, setLevel] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const close = () => callStore.set({ devices: { open: false, join: null } });
  const stream = inCall ? inCall.local : preview;

  // before joining, the preview is a stream of its own, closed when this does
  useEffect(() => {
    if (inCall) return;
    let open: MediaStream | null = null;
    let gone = false;
    const constraints = { audio: prefs.mic ? { deviceId: { ideal: prefs.mic } } : true, video: video ? (prefs.cam ? { deviceId: { ideal: prefs.cam } } : true) : false };
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((s) => {
        if (gone) return localMedia.stop(s);
        open = s;
        setPreview(s);
        setProblem(null);
        return localMedia.devices().then(setDevices);
      })
      .catch((err) => setProblem(localMedia.problem(err, video ? 'camera' : 'microphone')));
    return () => {
      gone = true;
      localMedia.stop(open);
    };
  }, [inCall, prefs.mic, prefs.cam, video]);

  useEffect(() => {
    if (inCall) void localMedia.devices().then(setDevices);
    const refresh = () => void localMedia.devices().then(setDevices);
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refresh);
  }, [inCall]);

  useEffect(() => {
    if (!stream?.getAudioTracks().length) return;
    audioLevels.watch('check', stream, () => {});
    const timer = window.setInterval(() => setLevel(Math.min(1, audioLevels.level('check') * 6)), 100);
    return () => {
      clearInterval(timer);
      audioLevels.unwatch('check');
    };
  }, [stream]);

  const choose = (kind: 'mic' | 'cam' | 'speaker', id: string) => {
    setPrefs((p) => ({ ...p, [kind]: id }));
    if (inCall) void callMedia.useDevice(kind, id);
    else localMedia.remember({ [kind]: id });
  };

  const start = async () => {
    if (!join) return;
    const view = callStore.get().live[join.callId];
    if (!view) return toast.show('That call has ended.', { tone: 'error' });
    setJoining(true);
    localMedia.stop(preview);
    try {
      await callSession.enter(view, { video });
      close();
    } catch (err) {
      toast.error(err);
      setJoining(false);
    }
  };

  const select = (kind: 'mic' | 'cam' | 'speaker', label: string, list: MediaDeviceInfo[]) =>
    list.length > 0 && (
      <label className="field">
        <span>{label}</span>
        <select className="select" value={prefs[kind] ?? list[0].deviceId} onChange={(e) => choose(kind, e.target.value)}>
          {list.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `${label} ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
    );

  const showVideo = inCall ? inCall.cam : video;
  return (
    <Modal
      title={join ? 'Join the call' : 'Microphone, camera and speaker'}
      onClose={close}
      width={520}
      footer={
        join ? (
          <>
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void start()} disabled={joining}>
              {joining && <Spinner size={13} />} Join
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={close}>
            Done
          </button>
        )
      }
    >
      <div className="modal-body call-check">
        <div className="call-preview">
          {showVideo && stream?.getVideoTracks().length ? (
            <VideoView stream={stream} mirror />
          ) : problem ? (
            <p className="call-preview-note bad" role="alert">
              <TriangleAlert aria-hidden="true" />
              {problem}
            </p>
          ) : (
            <p className="call-preview-note">
              {showVideo ? <Spinner size={18} /> : <CameraOff aria-hidden="true" />}
              {showVideo ? 'Starting your camera…' : join ? 'Your camera stays off. Turn it on below to join with video.' : 'Your camera is off.'}
            </p>
          )}
        </div>
        <div className="call-meter">
          <span id="call-meter-label">{level > 0.05 ? 'Your microphone hears you' : 'Say something to check your microphone'}</span>
          <div className="call-meter-bar" role="meter" aria-labelledby="call-meter-label" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
            <span style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
        </div>
        {join && (
          <label className="filter-toggle">
            <span>Join with your camera on</span>
            <button type="button" className="toggle" role="switch" aria-checked={video} onClick={() => setVideo((v) => !v)} aria-label="Join with your camera on" />
          </label>
        )}
        <div className="call-check-fields">
          {select('mic', 'Microphone', devices.mics)}
          {select('cam', 'Camera', devices.cams)}
          {localMedia.canPickSpeaker() && select('speaker', 'Speaker', devices.speakers)}
        </div>
      </div>
    </Modal>
  );
}
