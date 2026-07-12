import { useEffect, useRef, useState } from 'react';

/** Prototype-style multi-select with orange checkboxes and an "All" reset row. */
export function MultiSelect({
  options,
  selected,
  onChange,
  allLabel,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close when clicking anywhere outside the control.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);
  const summary = selected.length === 0 ? allLabel : selected.length === 1 ? selected[0] : `${selected.length} selected`;
  const toggle = (name: string): void => {
    const cur = [...selected];
    const i = cur.indexOf(name);
    if (i >= 0) cur.splice(i, 1);
    else cur.push(name);
    onChange(cur);
  };
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid var(--vl-borderStrong)', borderRadius: 4, padding: '6px 10px', fontSize: 12, color: 'var(--vl-ink)', cursor: 'pointer', background: 'var(--vl-card)', minWidth: 150 }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>
        <span style={{ color: 'var(--vl-sub)', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 30, background: 'var(--vl-card)', border: '1px solid var(--vl-borderStrong)', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,.16)', padding: 6, minWidth: 200, maxHeight: 260, overflowY: 'auto' }}>
          <div
            onClick={() => onChange([])}
            style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600, color: selected.length === 0 ? '#323F7C' : 'var(--vl-sub)', cursor: 'pointer', borderRadius: 4, background: selected.length === 0 ? 'var(--vl-navySoft)' : 'transparent' }}
          >
            ✓ {allLabel}
          </div>
          {options.map((o) => {
            const on = selected.includes(o);
            return (
              <div key={o} onClick={() => toggle(o)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 12, color: 'var(--vl-ink2)', cursor: 'pointer', borderRadius: 4, background: on ? 'var(--vl-hover)' : 'transparent' }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${on ? '#F47C20' : 'var(--vl-borderStrong)'}`, background: on ? '#F47C20' : '#fff', color: '#fff', fontSize: 10, lineHeight: '13px', textAlign: 'center', flexShrink: 0 }}>{on ? '✓' : ''}</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
