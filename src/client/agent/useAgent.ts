import { useEffect, useState } from 'react';
import { parseSnapshot, type Snapshot } from './snapshot.ts';

export function useAgent(url = '/events'): Snapshot | null {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    const source = new EventSource(url);
    source.onmessage = (e: MessageEvent<string>) => {
      const next = parseSnapshot(e.data);
      if (next) setSnapshot(next);
    };
    source.onerror = () => setSnapshot(null);
    return () => source.close();
  }, [url]);
  return snapshot;
}
