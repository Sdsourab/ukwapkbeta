import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { normalizeUrl } from '@ukw/domain';
import { QuickCapture } from '../components/QuickCapture';

/** Landing screen for the OS share sheet (Web Share Target). Pre-fills quick capture; nothing is saved until the user confirms. */
export function ShareTarget() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initial = useMemo(() => {
    const title = params.get('title') ?? '';
    const text = params.get('text') ?? '';
    let url = params.get('url') ?? '';
    // Many Android apps put the link in the text field instead of url.
    const found = text.match(/https?:\/\/[^\s]+/)?.[0];
    if (!url && found) url = found;
    const quote = found && text.trim() === found ? '' : text.replace(found ?? '', '').trim();
    const valid = normalizeUrl(url);
    return valid ? { mode: 'link' as const, url, title, quote } : { mode: 'note' as const, title, body: text };
  }, [params]);
  return <QuickCapture key={params.toString()} open onClose={() => navigate('/', { replace: true })} initial={initial} />;
}
