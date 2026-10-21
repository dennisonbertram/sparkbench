// Send files to a board's OTA server (see src/core/ota.ts) from the local server, so the browser
// doesn't have to reach into the local network itself.
import { OTA_PORT, otaToken } from '../src/core/ota';

export async function otaPush(host: string, projectId: string, files: Record<string, string>, port = OTA_PORT): Promise<string[]> {
  if (!/^[\w.-]+$/.test(host)) throw new Error('That doesn’t look like a board address (e.g. 192.168.1.42).');
  const token = otaToken(projectId);
  const base = `http://${host}:${port}`;
  const log: string[] = [];
  const info = await fetch(`${base}/info`, { headers: { 'X-Token': token }, signal: AbortSignal.timeout(4000) }).catch(() => null);
  if (!info) throw new Error(`No answer from ${host}:${port}. Is the board on the same Wi-Fi, and was the over-the-air update program copied over USB first?`);
  if (info.status === 403) throw new Error('The board has a different project’s update key. Copy this project to it over USB once.');
  for (const [name, src] of Object.entries(files)) {
    const r = await fetch(`${base}/upload?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'X-Token': token, 'Content-Length': String(Buffer.byteLength(src)) }, body: src, signal: AbortSignal.timeout(15000) });
    log.push(`${name}: ${await r.text()}`);
    if (!r.ok) throw new Error(`Upload of ${name} failed: ${log[log.length - 1]}`);
  }
  await fetch(`${base}/reset`, { method: 'POST', headers: { 'X-Token': token }, signal: AbortSignal.timeout(4000) }).catch(() => null);
  log.push('Board restarting with the new program.');
  return log;
}
