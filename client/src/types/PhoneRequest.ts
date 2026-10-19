// A request waiting for someone to confirm it on their phone.
export default interface PhoneRequest {
  id: number;
  kind: 'sign' | 'pay' | 'network';
  // when Nil stops waiting, in milliseconds since the epoch
  until: number;
  cancel: () => void;
}
