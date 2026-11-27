import { submitPronunciation } from '../src/api/pronunciation';
import { apiUrl } from '../src/api/config';

jest.mock('../src/api/tokenStorage', () => ({
  getAccessToken: jest.fn().mockResolvedValue(null),
  getRefreshToken: jest.fn(),
  saveTokens: jest.fn(),
  clearTokens: jest.fn(),
}));

describe('A03-AC-10 pin: native pronunciation upload', () => {
  const originalFetch = globalThis.fetch;
  let appended: Array<[string, unknown]>;
  let appendSpy: jest.SpyInstance;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    appended = [];
    const realAppend = FormData.prototype.append;
    appendSpy = jest.spyOn(FormData.prototype, 'append').mockImplementation(function (
      this: FormData,
      name: string,
      value: unknown,
    ) {
      appended.push([name, value]);
      return realAppend.call(this, name, value as never);
    } as never);
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ score: 1 }),
      json: async () => ({ score: 1 }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    appendSpy.mockRestore();
    globalThis.fetch = originalFetch;
  });

  it('A03-AC-10 posts a FormData body to the pronunciation route', async () => {
    await submitPronunciation({ audioUri: 'file:///tmp/rec.m4a', targetPhrase: 'dobar dan' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(apiUrl('/pronunciation'));
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('A03-AC-10 appends the audio part as { uri, name, type } with the file name and default audio/m4a', async () => {
    await submitPronunciation({ audioUri: 'file:///tmp/rec.m4a', targetPhrase: 'dobar dan' });
    const audio = appended.find(([n]) => n === 'audio');
    expect(audio?.[1]).toEqual({ uri: 'file:///tmp/rec.m4a', name: 'rec.m4a', type: 'audio/m4a' });
  });

  it('A03-AC-10 appends the audio part with a given mimeType', async () => {
    await submitPronunciation({ audioUri: 'file:///tmp/rec.wav', targetPhrase: 'x', mimeType: 'audio/wav' });
    const audio = appended.find(([n]) => n === 'audio');
    expect(audio?.[1]).toEqual({ uri: 'file:///tmp/rec.wav', name: 'rec.wav', type: 'audio/wav' });
  });

  it('A03-AC-10 appends targetPhrase', async () => {
    await submitPronunciation({ audioUri: 'file:///tmp/rec.m4a', targetPhrase: 'dobar dan' });
    expect(appended).toContainEqual(['targetPhrase', 'dobar dan']);
  });

  it('A03-AC-10 appends exerciseId when given', async () => {
    await submitPronunciation({ audioUri: 'file:///tmp/rec.m4a', targetPhrase: 'dobar dan', exerciseId: 'ex-7' });
    expect(appended).toContainEqual(['exerciseId', 'ex-7']);
  });

  it('A03-AC-10 does not append exerciseId when absent', async () => {
    await submitPronunciation({ audioUri: 'file:///tmp/rec.m4a', targetPhrase: 'dobar dan' });
    expect(appended.map(([n]) => n)).toEqual(['audio', 'targetPhrase']);
  });
});

// ---------------------------------------------------------------------------
// A12: web upload. Contract the implementer must match:
//   - native helper  app/src/api/appendAudio.ts      (today's { uri, name, type } part)
//   - web helper     app/src/api/appendAudio.web.ts  (fetch(audioUri) -> blob() -> append('audio', blob, name))
//   - both export    appendAudio(formData: FormData, audioUri: string, mimeType?: string): Promise<void>
//     (mimeType is the caller's optional value; the native helper applies the default 'audio/m4a').
//   - submitPronunciation awaits appendAudio(...) from './appendAudio', then appends targetPhrase / exerciseId.
// The jest-expo preset resolves native files, so the web case swaps the helper for its .web file via doMock.
// Web part rules observed here: the appended value is a Blob; with a typed blob it is that very blob;
// with an empty-type blob it is a Blob whose .type is the fallback (caller mimeType, else audio/webm).
// The file name (3rd append argument) is recording.<ext>; audio/mp4 is taken to match '.mp4'.
// ---------------------------------------------------------------------------
describe('A12 web pronunciation upload', () => {
  const originalFetch = globalThis.fetch;
  let appends: Array<{ name: string; value: unknown; fileName?: string }>;
  let appendSpy: jest.SpyInstance;
  let fetchMock: jest.Mock;
  let recordingBlob: Blob;
  let blobFetchError: Error | null;

  function setBlob(type: string) {
    recordingBlob = new Blob(['audio-bytes'], { type });
  }

  beforeEach(() => {
    appends = [];
    blobFetchError = null;
    setBlob('audio/webm');
    const realAppend = FormData.prototype.append;
    appendSpy = jest.spyOn(FormData.prototype, 'append').mockImplementation(function (
      this: FormData,
      name: string,
      value: unknown,
      fileName?: string,
    ) {
      appends.push({ name, value, fileName });
      return (realAppend as (...a: unknown[]) => void).apply(this, fileName === undefined ? [name, value] : [name, value, fileName]);
    } as never);
    fetchMock = jest.fn(async (url: string) => {
      if (String(url).startsWith('blob:')) {
        if (blobFetchError) throw blobFetchError;
        return { ok: true, status: 200, blob: async () => recordingBlob };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ score: 1 }),
        json: async () => ({ score: 1 }),
      };
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    appendSpy.mockRestore();
    globalThis.fetch = originalFetch;
    try {
      jest.dontMock('../src/api/appendAudio');
    } catch {
      // the helper module does not exist yet
    }
    jest.resetModules();
  });

  type Submit = typeof import('../src/api/pronunciation').submitPronunciation;

  /** Loads submitPronunciation with the web helper substituted for the native one. */
  function loadWeb(): Submit {
    let submit: Submit | undefined;
    jest.isolateModules(() => {
      jest.doMock('../src/api/appendAudio', () => jest.requireActual('../src/api/appendAudio.web'));
      submit = require('../src/api/pronunciation').submitPronunciation;
    });
    return submit as Submit;
  }

  const apiCalls = () => fetchMock.mock.calls.filter(([u]) => u === apiUrl('/pronunciation'));
  const audioPart = () => appends.find((a) => a.name === 'audio');
  const hasHeader = (headers: unknown, name: string): boolean => {
    if (!headers) return false;
    if (typeof (headers as Headers).has === 'function') return (headers as Headers).has(name);
    return Object.keys(headers as object).some((k) => k.toLowerCase() === name.toLowerCase());
  };

  it('A12-AC-1 web webm: appends the very blob with its type and a .webm name, posts without Content-Type', async () => {
    const submit = loadWeb();
    await submit({ audioUri: 'blob:http://localhost/abc-123', targetPhrase: 'dobar dan', exerciseId: 'ex-7' });
    expect(fetchMock.mock.calls.some(([u]) => u === 'blob:http://localhost/abc-123')).toBe(true);
    const part = audioPart();
    expect(part?.value).toBe(recordingBlob);
    expect((part?.value as Blob).type).toBe('audio/webm');
    expect(part?.fileName).toMatch(/\.webm$/);
    expect(appends.find((a) => a.name === 'targetPhrase')?.value).toBe('dobar dan');
    expect(appends.find((a) => a.name === 'exerciseId')?.value).toBe('ex-7');
    const calls = apiCalls();
    expect(calls).toHaveLength(1);
    const init = calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(hasHeader(init.headers, 'Content-Type')).toBe(false);
  });

  it('A12-AC-2 web audio/mp4 blob gets a .mp4 file name', async () => {
    setBlob('audio/mp4');
    const submit = loadWeb();
    await submit({ audioUri: 'blob:http://localhost/mp4', targetPhrase: 'x' });
    const part = audioPart();
    expect((part?.value as Blob).type).toBe('audio/mp4');
    expect(part?.fileName).toMatch(/\.mp4$/);
  });

  it('A12-AC-2 web untyped blob falls back to the caller mimeType and its extension', async () => {
    setBlob('');
    const submit = loadWeb();
    await submit({ audioUri: 'blob:http://localhost/ogg', targetPhrase: 'x', mimeType: 'audio/ogg' });
    const part = audioPart();
    expect(part?.value).toBeInstanceOf(Blob);
    expect((part?.value as Blob).type).toBe('audio/ogg');
    expect(part?.fileName).toMatch(/\.ogg$/);
  });

  it('A12-AC-2 web untyped blob without mimeType falls back to audio/webm and .webm', async () => {
    setBlob('');
    const submit = loadWeb();
    await submit({ audioUri: 'blob:http://localhost/none', targetPhrase: 'x' });
    const part = audioPart();
    expect(part?.value).toBeInstanceOf(Blob);
    expect((part?.value as Blob).type).toBe('audio/webm');
    expect(part?.fileName).toMatch(/\.webm$/);
  });

  it('A12-AC-3 web unreadable recording rejects and sends no pronunciation request', async () => {
    blobFetchError = new Error('blob gone');
    const submit = loadWeb();
    await expect(submit({ audioUri: 'blob:http://localhost/dead', targetPhrase: 'x' })).rejects.toBeDefined();
    expect(apiCalls()).toHaveLength(0);
  });

  it('A12-AC-4 native keeps { uri, name, type } with audio/m4a and never fetches the recording', async () => {
    let submit: Submit | undefined;
    jest.isolateModules(() => {
      submit = require('../src/api/pronunciation').submitPronunciation;
    });
    await (submit as Submit)({ audioUri: 'file:///tmp/rec.m4a', targetPhrase: 'dobar dan' });
    expect(audioPart()?.value).toEqual({ uri: 'file:///tmp/rec.m4a', name: 'rec.m4a', type: 'audio/m4a' });
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual([apiUrl('/pronunciation')]);
  });
});
