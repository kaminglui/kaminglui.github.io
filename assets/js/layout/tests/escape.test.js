import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeUrl } from '../escape.js';

describe('escapeHtml', () => {
  it('escapes the five standard HTML-unsafe characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
    expect(escapeHtml("it's <b>bold</b> & bright")).toBe(
      'it&#39;s &lt;b&gt;bold&lt;/b&gt; &amp; bright'
    );
  });

  it('coerces non-string inputs safely', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });

  it('leaves plain text alone', () => {
    expect(escapeHtml('Labs')).toBe('Labs');
  });
});

describe('escapeUrl', () => {
  it('allows http, https, mailto, hash, absolute, and relative URLs', () => {
    expect(escapeUrl('https://example.com')).toBe('https://example.com');
    expect(escapeUrl('http://x')).toBe('http://x');
    expect(escapeUrl('//cdn.example.com/x')).toBe('//cdn.example.com/x');
    expect(escapeUrl('mailto:me@example.com')).toBe('mailto:me@example.com');
    expect(escapeUrl('#top')).toBe('#top');
    expect(escapeUrl('/assets/x.css')).toBe('/assets/x.css');
    expect(escapeUrl('pages/circuit-lab/')).toBe('pages/circuit-lab/');
  });

  it('rejects javascript:, data:, vbscript:, and other schemes', () => {
    expect(escapeUrl('javascript:alert(1)')).toBe('#');
    expect(escapeUrl('JAVASCRIPT:alert(1)')).toBe('#');
    expect(escapeUrl('data:text/html,<script>')).toBe('#');
    expect(escapeUrl('vbscript:msgbox')).toBe('#');
  });

  it('escapes HTML-unsafe characters in the allowed path', () => {
    expect(escapeUrl('/search?q=<a>&b')).toBe('/search?q=&lt;a&gt;&amp;b');
  });

  it('returns # for non-string or empty input', () => {
    expect(escapeUrl(null)).toBe('#');
    expect(escapeUrl(undefined)).toBe('#');
    expect(escapeUrl('')).toBe('#');
    expect(escapeUrl('   ')).toBe('#');
  });
});
