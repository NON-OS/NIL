// Someone else in the call, as this browser sees them.
export default interface CallPeer {
  userId: string;
  session: string;
  // the connection between the two browsers
  link: 'connecting' | 'connected' | 'reconnecting' | 'lost' | 'refused';
  // what this browser holds for their key: confirmed by this person, first seen here, changed since, or none
  trust: 'confirmed' | 'new' | 'changed' | 'none' | 'unknown';
  // why the connection was refused, when it was
  refusal: string | null;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  quality: 'good' | 'fair' | 'poor' | null;
  speaking: boolean;
  media: MediaStream | null;
  screenMedia: MediaStream | null;
}
