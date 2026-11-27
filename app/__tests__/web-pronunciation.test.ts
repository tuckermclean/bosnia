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
