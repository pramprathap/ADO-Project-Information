import { describe, expect, it } from 'vitest';
import { toSafeHref, validateRepositoryUrl } from '@/utils/safeUrl';

describe('validateRepositoryUrl', () => {
  it('treats an empty value as valid and non-linkable', () => {
    const r = validateRepositoryUrl('');
    expect(r.isValid).toBe(true);
    expect(r.isLinkable).toBe(false);
  });

  it('accepts https URLs and marks them linkable', () => {
    const r = validateRepositoryUrl('https://dev.azure.com/org/project/_git/repo');
    expect(r.isValid).toBe(true);
    expect(r.isLinkable).toBe(true);
  });

  it('rejects http (non-https) URLs', () => {
    const r = validateRepositoryUrl('http://example.com/repo');
    expect(r.isValid).toBe(false);
    expect(r.isLinkable).toBe(false);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>',
    'file:///etc/passwd',
    'vbscript:msgbox',
  ])('rejects the unsafe scheme %s', (url) => {
    expect(validateRepositoryUrl(url).isValid).toBe(false);
  });

  it('accepts ssh git remotes but keeps them non-linkable', () => {
    const scp = validateRepositoryUrl('git@ssh.dev.azure.com:v3/org/project/repo');
    expect(scp.isValid).toBe(true);
    expect(scp.isLinkable).toBe(false);

    const ssh = validateRepositoryUrl('ssh://git@ssh.dev.azure.com/v3/org/project/repo');
    expect(ssh.isValid).toBe(true);
    expect(ssh.isLinkable).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(validateRepositoryUrl('not a url').isValid).toBe(false);
  });
});

describe('toSafeHref', () => {
  it('returns the url only for linkable https values', () => {
    expect(toSafeHref('https://example.com')).toBe('https://example.com');
  });

  it('returns undefined for unsafe or non-linkable values', () => {
    expect(toSafeHref('javascript:alert(1)')).toBeUndefined();
    expect(toSafeHref('git@host:org/repo')).toBeUndefined();
    expect(toSafeHref('')).toBeUndefined();
  });
});
