// "Attach a photo or sketch" control for the design prompt.
import React, { useRef } from 'react';
import { shrinkImage, type Shrunk } from './images';

export function AttachImages({ images, onChange, label = 'Attach a photo or sketch' }: { images: Shrunk[]; onChange: (x: Shrunk[]) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="attach">
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="attach-input"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])].slice(0, 3);
          e.target.value = '';
          onChange([...images, ...(await Promise.all(files.map((f) => shrinkImage(f))))].slice(0, 3));
        }}
      />
      {images.map((im, i) => (
        <span key={i} className="attach-thumb">
          <img src={im.preview} alt={`Attached image ${i + 1}`} />
          <button type="button" aria-label="Remove image" onClick={() => onChange(images.filter((_, j) => j !== i))}>✕</button>
        </span>
      ))}
      <button type="button" className="ghost attach-btn" onClick={() => input.current?.click()} title="Design from a photo of a gadget or a hand sketch">
        📎 {images.length ? '' : label}
      </button>
    </span>
  );
}
