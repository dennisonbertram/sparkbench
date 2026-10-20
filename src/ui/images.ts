// Shrink photos before sending them anywhere (phone photos are often 5–12 MB).
export interface Shrunk {
  data: string; // base64, no prefix
  mediaType: 'image/jpeg';
  preview: string; // data URL
}

export async function shrinkImage(file: File, max = 1800): Promise<Shrunk> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  return { data: url.split(',')[1], mediaType: 'image/jpeg', preview: url };
}

/** A small thumbnail for chat history (kept in local storage). */
export async function thumbnail(preview: string, max = 160): Promise<string> {
  const img = new Image();
  img.src = preview;
  await img.decode();
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}
