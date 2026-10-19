import type PhoneRequest from '../../types/PhoneRequest';

let list: PhoneRequest[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

// Requests waiting for a tap on the phone, oldest first, for the notice that asks for it.
const phonePending = {
  get: () => list,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  // Returns what to call once the request is answered, refused or given up on.
  add(request: PhoneRequest) {
    list = [...list, request];
    emit();
    return () => {
      list = list.filter((r) => r !== request);
      emit();
    };
  },
};

export default phonePending;
