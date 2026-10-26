// "Attach a photo or sketch" control for the design prompt.
import React from 'react';
import { shrinkImage, type Shrunk } from './images';
import { FilePicker, IconButton } from './ds';

export function AttachImages({ images, onChange, label = 'Attach a photo or sketch' }: { images: Shrunk[]; onChange: (x: Shrunk[]) => void; label?: string }) {
  return (
    <span className="attach">
      {images.map((im, i) => (
        <span key={i} className="attach-thumb">
          <img src={im.preview} alt={`Attached image ${i + 1}`} />
          <IconButton variant="default" label="Remove image" onClick={() => onChange(images.filter((_, j) => j !== i))}>✕</IconButton>
        </span>
      ))}
      <FilePicker
        variant="ghost"
        className="attach-btn"
        accept="image/*"
        multiple
        data-testid="attach-input"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])].slice(0, 3);
          e.target.value = '';
          onChange([...images, ...(await Promise.all(files.map((f) => shrinkImage(f))))].slice(0, 3));
        }}
      >
        <span title="Design from a photo of a gadget or a hand sketch">📎 {images.length ? '' : label}</span>
      </FilePicker>
    </span>
  );
}
