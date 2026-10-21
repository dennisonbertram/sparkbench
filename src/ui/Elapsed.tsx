// Live wait text for AI requests: elapsed seconds against the usual time, and a reassuring
// note once it runs longer than that.
import React, { useEffect, useState } from 'react';

export function Elapsed({ label, usual }: { label: string; usual: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span aria-live="polite">
      {label} {t} s{t < usual ? ` (usually about ${usual} s)` : ': taking longer than usual, still working'}
    </span>
  );
}
