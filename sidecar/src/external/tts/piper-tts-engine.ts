import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type {
  TtsAudioChunk,
  TtsAudioEnd,
  TtsAudioStart,
  TtsEngine,
  TtsStream,
} from '../../shared/abstractions/tts-engine';
import type { SidecarConfigService } from '../../shared/abstractions/sidecar-config-service';

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

const splitCompleteSentences = (
  buffer: string,
  softMinChars: number,
  softMaxChars: number,
): { segments: string[]; remaining: string } => {
  const segments: string[] = [];
  let cursor = 0;

  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index];
    if (char !== '.' && char !== '!' && char !== '?') continue;

    const previous = buffer[index - 1] ?? '';
    const next = buffer[index + 1] ?? '';
    if (/^[0-9]$/.test(previous) && /^[0-9]$/.test(next)) continue;

    let end = index + 1;
    while (end < buffer.length && '"\')]}'.includes(buffer[end])) end += 1;
    if (end < buffer.length && !/\s/.test(buffer[end])) continue;

    const segment = normalize(buffer.slice(cursor, end));
    if (segment) segments.push(segment);
    cursor = end;
    while (cursor < buffer.length && /\s/.test(buffer[cursor])) cursor += 1;
    index = cursor - 1;
  }

  const remaining = buffer.slice(cursor);
  if (softMaxChars > 0 && remaining.length >= softMaxChars) {
    let cut = remaining.lastIndexOf(' ', softMaxChars);
    if (cut < softMinChars) cut = remaining.indexOf(' ', softMinChars);
    if (cut >= softMinChars) {
      const segment = normalize(remaining.slice(0, cut));
      if (segment) segments.push(segment);
      return { segments, remaining: remaining.slice(cut).trimStart() };
    }
  }

  return { segments, remaining };
};

class PiperTtsStream implements TtsStream {
  private buffer = '';
  private chunkIndex = 0;
  private started = false;
  private cancelled = false;
  private readonly startedAt = Date.now();
  private work: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: {
      binPath: string;
      modelPath: string;
      configPath: string;
      sampleRate: number;
      softMinChars: number;
      softMaxChars: number;
    },
    private readonly handlers: {
      onStart: (event: TtsAudioStart) => Promise<void>;
      onChunk: (event: TtsAudioChunk) => Promise<void>;
      onEnd: (event: TtsAudioEnd) => Promise<void>;
    },
  ) {}

  async pushText(text: string): Promise<void> {
    if (this.cancelled) return;
    this.buffer += text;
    const { segments, remaining } = splitCompleteSentences(
      this.buffer,
      this.config.softMinChars,
      this.config.softMaxChars,
    );
    this.buffer = remaining;

    for (const sentence of segments) {
      this.work = this.work.then(() => this.synthesizeSentence(sentence));
    }
  }

  async finalize(): Promise<void> {
    if (this.cancelled) return;
    const tail = normalize(this.buffer);
    this.buffer = '';

    if (tail) {
      this.work = this.work.then(() => this.synthesizeSentence(tail));
    }

    await this.work;
    if (this.started) {
      await this.handlers.onEnd({ ttsTime: (Date.now() - this.startedAt) / 1000 });
    }
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
  }

  private async synthesizeSentence(sentence: string): Promise<void> {
    if (this.cancelled || sentence.length === 0) return;

    const audioB64 = await this.runPiper(sentence);
    if (!audioB64 || this.cancelled) return;

    if (!this.started) {
      this.started = true;
      await this.handlers.onStart({ sampleRate: this.config.sampleRate, sentenceCount: 0 });
    }

    await this.handlers.onChunk({ audio: audioB64, index: this.chunkIndex++ });
  }

  private async runPiper(text: string): Promise<string> {
    return new Promise<string>((resolvePromise, rejectPromise) => {
      const child = spawn(
        this.config.binPath,
        ['--model', this.config.modelPath, '--config', this.config.configPath, '--output-raw'],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
      child.once('error', (error) => rejectPromise(error));
      child.once('exit', (code, signal) => {
        if (code === 0) {
          resolvePromise(Buffer.concat(stdoutChunks).toString('base64'));
          return;
        }

        const details = Buffer.concat(stderrChunks).toString('utf8').trim();
        rejectPromise(
          new Error(
            `Piper exited unexpectedly (${signal ?? code ?? 'unknown'})${details ? `: ${details}` : '.'}`,
          ),
        );
      });

      child.stdin.write(`${text}\n`);
      child.stdin.end();
    });
  }
}

class NoopTtsStream implements TtsStream {
  async pushText(_text: string): Promise<void> {}
  async finalize(): Promise<void> {}
  async cancel(): Promise<void> {}
}

export class PiperTtsEngine implements TtsEngine {
  constructor(
    private readonly config: {
      enabled: boolean;
      binPath: string;
      modelPath: string;
      configPath: string;
      sampleRate: number;
      softMinChars: number;
      softMaxChars: number;
    },
  ) {}

  static fromConfig(configService: SidecarConfigService): PiperTtsEngine {
    const ttsConfig = configService.tts;

    if (ttsConfig.backend !== 'piper') {
      return new PiperTtsEngine({
        enabled: false,
        binPath: '',
        modelPath: '',
        configPath: '',
        sampleRate: ttsConfig.piperSampleRate,
        softMinChars: ttsConfig.softMinChars,
        softMaxChars: ttsConfig.softMaxChars,
      });
    }

    const enabled =
      existsSync(ttsConfig.piperBinPath) &&
      existsSync(ttsConfig.piperModelPath) &&
      existsSync(ttsConfig.piperConfigPath);

    return new PiperTtsEngine({
      enabled,
      binPath: ttsConfig.piperBinPath,
      modelPath: ttsConfig.piperModelPath,
      configPath: ttsConfig.piperConfigPath,
      sampleRate: ttsConfig.piperSampleRate,
      softMinChars: ttsConfig.softMinChars,
      softMaxChars: ttsConfig.softMaxChars,
    });
  }

  isAvailable(): boolean {
    return this.config.enabled;
  }

  createStream(handlers: {
    onStart: (event: TtsAudioStart) => Promise<void>;
    onChunk: (event: TtsAudioChunk) => Promise<void>;
    onEnd: (event: TtsAudioEnd) => Promise<void>;
  }): TtsStream {
    if (!this.config.enabled) return new NoopTtsStream();

    return new PiperTtsStream(
      {
        binPath: this.config.binPath,
        modelPath: this.config.modelPath,
        configPath: this.config.configPath,
        sampleRate: this.config.sampleRate,
        softMinChars: this.config.softMinChars,
        softMaxChars: this.config.softMaxChars,
      },
      handlers,
    );
  }
}
