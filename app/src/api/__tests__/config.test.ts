describe('apiUrl', () => {
  const originalEnv = process.env.EXPO_PUBLIC_API_BASE_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EXPO_PUBLIC_API_BASE_URL;
    } else {
      process.env.EXPO_PUBLIC_API_BASE_URL = originalEnv;
    }
  });

  it('produces exactly one slash between the host and /api when the base URL has no trailing slash', () => {
    let apiUrl!: typeof import('../config').apiUrl;
    jest.isolateModules(() => {
      process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.168.0.238:3000';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      apiUrl = require('../config').apiUrl;
    });

    expect(apiUrl('/tutor/session')).toBe('http://192.168.0.238:3000/api/tutor/session');
  });

  it('strips a trailing slash from the base URL so it does not produce a double slash', () => {
    let apiUrl!: typeof import('../config').apiUrl;
    jest.isolateModules(() => {
      process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.168.0.238:3000/';
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      apiUrl = require('../config').apiUrl;
    });

    expect(apiUrl('/tutor/session')).toBe('http://192.168.0.238:3000/api/tutor/session');
    expect(apiUrl('/tutor/session')).not.toContain('//api');
  });
});
