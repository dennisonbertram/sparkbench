import { afterEach, describe, expect, it, vi } from 'vitest';
import { FirmwareClient, type FirmwareHandlers } from '../../src/ui/firmwareClient';
import type { Project } from '../../src/core/types';

const project = {
  board: 'esp32',
  parts: [
    { id: 'board1', type: 'esp32-devkit', props: {} },
    { id: 'button1', type: 'pushbutton', props: {} },
    { id: 'switch1', type: 'slide-switch', props: {} },
  ],
} as Project;
const handlers = (): FirmwareHandlers => ({ frame: vi.fn(), artifact: vi.fn(), error: vi.fn(), done: vi.fn() });
const encoder = new TextEncoder();

function stream() {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; } }));
  return {
    response,
    send: (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)),
    text: (value: string) => controller.enqueue(encoder.encode(value)),
    close: () => controller.close(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('firmware browser transport', () => {
  it('parses split events and sends the chosen binary instead of Python code', async () => {
    const wire = stream();
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    fetcher.mockResolvedValueOnce(wire.response);
    vi.stubGlobal('fetch', fetcher);
    const callbacks = handlers();
    const client = new FirmwareClient(callbacks);
    const finished = client.start(project, { name: 'flash.bin', base64: 'abcd' }, { 'button1.pressed': 0, 'board1.wifi': 1 });
    wire.text('{"type":"ses');
    wire.text('sion","id":"token","artifact":{"name":"flash.bin","sha256":"hash"}}\n');
    wire.send({ type: 'frame', frame: { status: 'running', t: 1 } });
    wire.send({ type: 'done' });
    await finished;
    expect(callbacks.artifact).toHaveBeenCalledWith({ name: 'flash.bin', sha256: 'hash' });
    expect(callbacks.frame).toHaveBeenCalledWith({ status: 'running', t: 1 });
    expect(callbacks.error).not.toHaveBeenCalled();
    expect(callbacks.done).toHaveBeenCalledOnce();
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ firmware: { name: 'flash.bin', base64: 'abcd' }, inputs: { 'button1.pressed': 0 } });
    expect('board1.wifi' in JSON.parse(fetcher.mock.calls[0][1].body).inputs).toBe(false);
  });

  it('buffers boot-time input and serializes press/release requests', async () => {
    const wire = stream();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let count = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/run')) return wire.response;
      if (url.endsWith('/input') && ++count === 1) await held;
      return new Response('{}');
    });
    vi.stubGlobal('fetch', fetcher);
    const callbacks = handlers();
    const client = new FirmwareClient(callbacks);
    const finished = client.start(project, 'demo', {});
    client.input('button1', 'pressed', 1);
    wire.send({ type: 'session', id: 'token', artifact: { name: 'demo', sha256: 'hash' } });
    await vi.waitFor(() => expect(count).toBe(1));
    client.input('button1', 'pressed', 0);
    await Promise.resolve();
    expect(count).toBe(1);
    release();
    await vi.waitFor(() => expect(count).toBe(2));
    wire.send({ type: 'done' });
    await finished;
    expect(callbacks.error).not.toHaveBeenCalled();
  });

  it('reports unexpected disconnects rather than a successful run', async () => {
    const wire = stream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(wire.response));
    const callbacks = handlers();
    const finished = new FirmwareClient(callbacks).start(project, 'demo', {});
    wire.close();
    await finished;
    expect(callbacks.error).toHaveBeenCalledWith('The firmware runtime disconnected unexpectedly.');
  });

  it('cancels an in-flight start without delivering stale errors or frames', async () => {
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
    })));
    const callbacks = handlers();
    const client = new FirmwareClient(callbacks);
    const finished = client.start(project, 'demo', {});
    client.stop();
    await finished;
    expect(callbacks.error).not.toHaveBeenCalled();
    expect(callbacks.frame).not.toHaveBeenCalled();
    expect(callbacks.done).not.toHaveBeenCalled();
  });

  it('shows invalid-image errors returned before a session is created', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"Not a merged ESP32 image"}', { status: 400 })));
    const callbacks = handlers();
    await new FirmwareClient(callbacks).start(project, { name: 'app.bin', base64: 'bad' }, {});
    expect(callbacks.error).toHaveBeenCalledWith('Not a merged ESP32 image');
    expect(callbacks.done).toHaveBeenCalledOnce();
  });
});
