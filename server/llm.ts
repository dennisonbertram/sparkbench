// One structured-output call to Claude, through whichever route this machine has:
// 1) the Anthropic SDK when ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN is set, or
// 2) the locally installed, logged-in Claude Code CLI in headless mode (`claude -p`).
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentRequest } from './tenancy/als';
import { recordAiUsage } from './tenancy/repo';

export const MODEL = 'claude-opus-5-5';

let cliPath: string | null | undefined;
function findCli(): string | null {
  if (cliPath !== undefined) return cliPath;
  try {
    cliPath = execFileSync('/bin/sh', ['-lc', 'command -v claude'], { encoding: 'utf8' }).trim() || null;
  } catch {
    cliPath = null;
  }
  return cliPath;
}

export type Backend = 'api' | 'claude-cli' | 'none';

export function backend(): Backend {
  if (process.env.SPARKBENCH_AI === 'off') return 'none';
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return 'api';
  // A hosted server serves many people: it must not run on someone's personal Claude Code login.
  if (process.env.SPARKBENCH_MODE === 'hosted') return 'none';
  if (process.env.SPARKBENCH_AI !== 'api' && findCli()) return 'claude-cli';
  return 'none';
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ImageInput {
  /** base64 without the data: prefix */
  data: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

/** Ask Claude for JSON matching `schema`. `turns` is the conversation (last turn = user); `images` go with the last turn. */
export async function askJson<T extends z.ZodType>(system: string, turns: Turn[], schema: T, opts: { effort?: 'low' | 'medium' | 'high'; web?: boolean; images?: ImageInput[] } = {}): Promise<z.infer<T>> {
  const images = opts.images ?? [];
  const b = backend();
  if (b === 'api') {
    const client = new Anthropic();
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      ...({ fallbacks: 'default' } as object),
      output_config: { effort: opts.effort ?? 'medium', format: betaZodOutputFormat(schema) },
      system,
      messages: turns.map((t, i) =>
        i === turns.length - 1 && images.length
          ? { role: t.role, content: [...images.map((im) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.mediaType, data: im.data } })), { type: 'text' as const, text: t.content }] }
          : { role: t.role, content: t.content },
      ),
      ...(opts.web ? { tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }, { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 5 }] as any } : {}),
    });
    const scope = currentRequest();
    if (scope && res.usage) await recordAiUsage(scope.ctx, scope.route, (res.usage.input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0), res.usage.output_tokens ?? 0).catch(() => {});
    if (res.stop_reason === 'refusal') throw new Error('Claude declined this request.');
    if (!res.parsed_output) throw new Error('Claude returned an unreadable answer.');
    return res.parsed_output as z.infer<T>;
  }
  if (b === 'claude-cli') {
    // The CLI takes images as files it reads with its Read tool.
    const cwd = mkdtempSync(join(tmpdir(), 'sparkbench-ai-'));
    const names = images.map((im, i) => {
      const name = `photo-${i + 1}.${im.mediaType.split('/')[1].replace('jpeg', 'jpg')}`;
      writeFileSync(join(cwd, name), Buffer.from(im.data, 'base64'));
      return name;
    });
    const seeImages = names.length ? `\n\nFirst use the Read tool to look at the attached image file${names.length > 1 ? 's' : ''}: ${names.map((n) => `./${n}`).join(', ')}.` : '';
    const transcript =
      (turns.length === 1
        ? turns[0].content
        : turns.map((t) => `<${t.role}>\n${t.content}\n</${t.role}>`).join('\n\n') + '\n\nRespond to the last <user> message.') + seeImages;
    const { $schema: _drop, ...plain } = z.toJSONSchema(schema) as Record<string, unknown>;
    const jsonSchema = JSON.stringify(plain);
    const tools = [...(opts.web ? ['WebSearch', 'WebFetch'] : []), ...(names.length ? ['Read'] : [])].join(',');
    const args = ['-p', '--output-format', 'json', '--tools', tools, ...(tools ? ['--allowedTools', tools] : []), '--strict-mcp-config', '--no-session-persistence', '--setting-sources', '', '--model', MODEL, '--effort', opts.effort ?? 'medium', '--system-prompt', system, '--json-schema', jsonSchema];
    const out = await new Promise<string>((resolve, reject) => {
      const child = execFile(findCli()!, args, { cwd, timeout: 240000, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && !stdout) reject(new Error(`Claude CLI failed: ${stderr || err.message}`));
        else resolve(stdout);
      });
      child.stdin?.end(transcript);
    });
    const data = JSON.parse(out);
    if (data.is_error) throw new Error(`Claude CLI error: ${data.result ?? data.subtype}`);
    const parsed = schema.safeParse(data.structured_output ?? JSON.parse(data.result));
    if (!parsed.success) throw new Error('Claude returned JSON that did not match the expected shape.');
    return parsed.data;
  }
  throw new Error('No AI available: set ANTHROPIC_API_KEY or install and log in to Claude Code.');
}
