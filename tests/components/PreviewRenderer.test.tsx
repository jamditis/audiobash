import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PreviewRenderer from '../../src/components/PreviewRenderer';

describe('PreviewRenderer image refresh', () => {
  it('requests a new image resource when the refresh key changes', () => {
    const url = '/tmp/audiobash-preview.svg';
    const { rerender } = render(<PreviewRenderer url={url} refreshKey={0} />);
    const initialSrc = screen.getByRole('img', { name: 'Preview' }).getAttribute('src');

    rerender(<PreviewRenderer url={url} refreshKey={1} />);
    const refreshedSrc = screen.getByRole('img', { name: 'Preview' }).getAttribute('src');

    expect(refreshedSrc).not.toBe(initialSrc);
    expect(new URL(initialSrc!).searchParams.get('audiobash-refresh')).toBe('0');
    expect(new URL(refreshedSrc!).searchParams.get('audiobash-refresh')).toBe('1');
  });

  it('does not change a signed remote image URL', () => {
    const url = 'https://example.com/preview.svg?signature=original';
    const { rerender } = render(<PreviewRenderer url={url} refreshKey={0} />);
    const initialImage = screen.getByRole('img', { name: 'Preview' });

    expect(initialImage).toHaveAttribute('src', url);

    rerender(<PreviewRenderer url={url} refreshKey={1} />);

    const refreshedImage = screen.getByRole('img', { name: 'Preview' });
    expect(refreshedImage).toHaveAttribute('src', url);
    expect(refreshedImage).not.toBe(initialImage);
    expect(initialImage.isConnected).toBe(false);
  });

  it('contains an invalid relative image URL inside the preview', () => {
    const url = 'Screen Shot 2026-08-28.png';

    expect(() => render(<PreviewRenderer url={url} refreshKey={0} />)).not.toThrow();
    expect(screen.getByRole('img', { name: 'Preview' })).toHaveAttribute('src', `file://${url}`);
  });
});
