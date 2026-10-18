/**
 * SigV4 verification against AWS's published test vectors
 * (docs.aws.amazon.com AmazonS3 sig-v4 examples — inputs & expected signatures
 * reproduced verbatim; cross-checked across independent implementations).
 */

import { describe, expect, it } from 'vitest';
import { presignUrl, signRequest, uriEncode, type AwsCredentials } from './sigv4';

const AWS_DOCS: AwsCredentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
};

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const NOW = new Date('2013-05-24T00:00:00.000Z');

describe('uriEncode', () => {
  it('keeps unreserved characters and slashes (path mode)', () => {
    expect(uriEncode('Abc-123._~/', false)).toBe('Abc-123._~/');
    expect(uriEncode('a b')).toBe('a%20b');
    expect(uriEncode('a+b')).toBe('a%2Bb');
    expect(uriEncode('a/b')).toBe('a%2Fb'); // slash encoded in query mode
    expect(uriEncode('tên file')).toBe('t%C3%AAn%20file');
    expect(uriEncode('s3Comp$t')).toBe('s3Comp%24t');
  });
});

describe('signRequest — AWS published vectors', () => {
  it('matches the documented GET Object signature (host;range;x-amz-*)', async () => {
    const headers = await signRequest({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      credentials: AWS_DOCS,
      headers: { range: 'bytes=0-9' },
      now: NOW,
    });
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(headers['x-amz-content-sha256']).toBe(EMPTY_SHA256);
    expect(headers['x-amz-date']).toBe('20130524T000000Z');
  });

  it('matches the documented PUT Object signature (encoded $ in path, payload hash)', async () => {
    const headers = await signRequest({
      method: 'PUT',
      url: 'https://examplebucket.s3.amazonaws.com/test$file.text',
      credentials: AWS_DOCS,
      headers: {
        date: 'Fri, 24 May 2013 00:00:00 GMT',
        'x-amz-storage-class': 'REDUCED_REDUNDANCY',
      },
      body: 'Welcome to Amazon S3.',
      now: NOW,
    });
    expect(headers.authorization).toContain(
      'SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class',
    );
    expect(headers.authorization).toMatch(/Signature=[0-9a-f]{64}$/);
    // Full documented signature for this exact request:
    expect(headers.authorization).toContain(
      'Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
    );
  });
});

describe('presignUrl', () => {
  const b2: AwsCredentials = {
    accessKeyId: 'key-id-001',
    secretAccessKey: 'app-key-secret',
    region: 'us-west-002',
  };

  it('emits the full query-auth parameter set with a 64-hex signature', async () => {
    const url = new URL(
      await presignUrl({
        method: 'PUT',
        url: 'https://s3.us-west-002.backblazeb2.com/conai-personal/u1/f1/hello.png',
        credentials: b2,
        expiresIn: 900,
        now: NOW,
      }),
    );
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toBe(
      'key-id-001/20130524/us-west-002/s3/aws4_request',
    );
    expect(url.searchParams.get('X-Amz-Date')).toBe('20130524T000000Z');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for identical inputs and changes when inputs change', async () => {
    const base = {
      method: 'GET' as const,
      url: 'https://s3.us-west-002.backblazeb2.com/conai-personal/u1/f1/hello.png',
      credentials: b2,
      now: NOW,
    };
    const a = await presignUrl({ ...base, expiresIn: 600 });
    const b = await presignUrl({ ...base, expiresIn: 600 });
    const c = await presignUrl({ ...base, expiresIn: 601 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    // The query contains only single-encoded values (no double-encoding of %)
    expect(a).not.toMatch(/%25/);
  });

  it('different methods produce different signatures', async () => {
    const url = 'https://s3.us-west-002.backblazeb2.com/conai-personal/u1/f1/hello.png';
    const put = await presignUrl({ method: 'PUT', url, credentials: b2, now: NOW });
    const get = await presignUrl({ method: 'GET', url, credentials: b2, now: NOW });
    expect(put).not.toBe(get);
  });
});
