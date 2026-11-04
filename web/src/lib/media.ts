/** V2: phones and tablets get the single-pane, tabbed workbench. */
import { useEffect, useState } from 'react';

export const COMPACT_QUERY = '(max-width: 900px)';

export function useMedia(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [on, setOn] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const change = () => setOn(mq.matches);
    change();
    mq.addEventListener('change', change);
    return () => mq.removeEventListener('change', change);
  }, [query]);
  return on;
}

/** Characters a phone keyboard hides behind a long press or a layer switch. */
export const SYMBOLS = ['{', '}', '(', ')', '[', ']', ';', ':', '=', '<', '>', '"', "'", '&', '|', '!', '_', '+', '-', '*', '/', '%', '.', ','];
