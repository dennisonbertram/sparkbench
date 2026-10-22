import { StringDecoder } from 'node:string_decoder';

export class Esp32SerialDecoder {
  private readonly decoder = new StringDecoder('utf8');
  private buffer = '';
  private ended = false;

  writeByte(value: number): string[] {
    if (this.ended) return [];
    this.buffer += this.decoder.write(Buffer.from([value]));
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    return lines.filter(Boolean);
  }

  end(): string[] {
    if (this.ended) return [];
    this.ended = true;
    this.buffer += this.decoder.end();
    const fragment = this.buffer;
    this.buffer = '';
    return fragment ? [fragment] : [];
  }
}
