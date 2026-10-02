import { createRoot } from 'react-dom/client';

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
worker.onmessage = (e) => console.log('[arena]', e.data.kind);
createRoot(document.getElementById('root')!).render(<p>Арена</p>);
