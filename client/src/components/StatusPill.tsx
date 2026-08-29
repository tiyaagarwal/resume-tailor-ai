import type { ReactNode } from 'react';

interface StatusPillProps {
  status: 'PASSED' | 'FAILED' | 'PENDING';
  children?: ReactNode;
}

export default function StatusPill({ status, children }: StatusPillProps) {
  const cls =
    status === 'PASSED' ? 'stamp-pass' : status === 'FAILED' ? 'stamp-fail' : 'tag-neutral';
  const dot = status === 'PASSED' ? '●' : status === 'FAILED' ? '●' : '○';
  return (
    <span className={cls}>
      <span className="mr-1" aria-hidden>
        {dot}
      </span>
      {children ?? status}
    </span>
  );
}
