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
  // this browser sends them nothing yet: their key isn't confirmed and this person hasn't said to go ahead
  held: boolean;
  // their browser sends this one nothing yet, for the same reason on their side
  holding: boolean;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  quality: 'good' | 'fair' | 'poor' | null;
  speaking: boolean;
  media: MediaStream | null;
  screenMedia: MediaStream | null;
}
