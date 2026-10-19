// Where WalletConnect keeps its session keys and records: this browser's local storage, under
// one prefix per connection, so disconnecting or signing out forgets every one of them. None of
// it ever leaves the browser except inside WalletConnect's own encrypted messages.
const ROOT = 'nonos:wc:';
const CURRENT = `${ROOT}current`;
const ID = /^[a-z0-9]{8,40}$/;

function keysUnder(prefix: string) {
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) out.push(key);
    }
  } catch {}
  return out;
}

function read(key: string) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const phoneStorage = {
  // The store for connection `id`, in the shape WalletConnect's client takes. Once closed it
  // writes nothing more, so a client being shut down can't put back what was just forgotten.
  open(id: string) {
    const prefix = `${ROOT}${id}:`;
    let open = true;
    return {
      getKeys: async () => keysUnder(prefix).map((key) => key.slice(prefix.length)),
      getEntries: async () => keysUnder(prefix).map((key) => [key.slice(prefix.length), read(key)] as [string, unknown]),
      getItem: async (key: string) => read(prefix + key),
      async setItem(key: string, value: unknown) {
        if (!open) return;
        try {
          if (value === undefined) localStorage.removeItem(prefix + key);
          else localStorage.setItem(prefix + key, JSON.stringify(value));
        } catch {}
      },
      async removeItem(key: string) {
        try {
          localStorage.removeItem(prefix + key);
        } catch {}
      },
      close() {
        open = false;
      },
    };
  },

  // The connection of a phone wallet the person confirmed, which a reload picks up again.
  current(): string | null {
    try {
      const id = localStorage.getItem(CURRENT);
      return id && ID.test(id) ? id : null;
    } catch {
      return null;
    }
  },

  remember(id: string) {
    try {
      localStorage.setItem(CURRENT, id);
    } catch {}
  },

  // Every connection's keys and records, and which one was current.
  forgetAll() {
    for (const key of keysUnder(ROOT)) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }
  },
};

export default phoneStorage;
