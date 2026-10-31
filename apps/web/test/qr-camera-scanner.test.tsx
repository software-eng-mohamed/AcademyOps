import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QrCameraScanner } from '@/components/qr-camera-scanner';

describe('QrCameraScanner', () => {
  let mockTrack: {
    stop: ReturnType<typeof vi.fn>;
    getCapabilities: ReturnType<typeof vi.fn>;
    applyConstraints: ReturnType<typeof vi.fn>;
  };
  let mockStream: {
    getTracks: ReturnType<typeof vi.fn>;
    getVideoTracks: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockTrack = {
      stop: vi.fn(),
      getCapabilities: vi.fn(() => ({ torch: true })),
      applyConstraints: vi.fn(() => Promise.resolve()),
    };
    mockStream = {
      getTracks: vi.fn(() => [mockTrack]),
      getVideoTracks: vi.fn(() => [mockTrack]),
    };

    // Mock HTMLMediaElement.prototype.play
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());

    // Mock navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(() => Promise.resolve(mockStream)),
        enumerateDevices: vi.fn(() =>
          Promise.resolve([
            { kind: 'videoinput', deviceId: '1', label: 'Back' },
            { kind: 'videoinput', deviceId: '2', label: 'Front' },
          ]),
        ),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('initializes camera with environment facingMode and shows controls', async () => {
    const onScan = vi.fn();
    render(<QrCameraScanner onScan={onScan} locale="ar" />);

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          facingMode: { ideal: 'environment' },
        }),
      }),
    );

    // Should find flashlight button and switch camera button once ready
    await waitFor(() => {
      expect(screen.getByLabelText('تشغيل الكشاف')).toBeInTheDocument();
      expect(screen.getByLabelText('تبديل الكاميرا')).toBeInTheDocument();
    });

    // Toggle flashlight
    fireEvent.click(screen.getByLabelText('تشغيل الكشاف'));
    expect(mockTrack.applyConstraints).toHaveBeenCalledWith({
      advanced: [{ torch: true }],
    });
  });

  it('handles permission denied error and allows switching to manual input', async () => {
    const onScan = vi.fn();
    const onFallbackManual = vi.fn();

    const notAllowedError = new Error('Permission denied');
    notAllowedError.name = 'NotAllowedError';
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(notAllowedError);

    render(<QrCameraScanner onScan={onScan} locale="ar" onFallbackManual={onFallbackManual} />);

    await screen.findByText('تم رفض إذن الكاميرا. يُرجى تفعيل إذن الكاميرا من إعدادات المتصفح.');
    const fallbackBtn = screen.getByRole('button', { name: 'الانتقال للإدخال اليدوي' });
    fireEvent.click(fallbackBtn);
    expect(onFallbackManual).toHaveBeenCalledOnce();
  });

  it('stops media stream tracks on component unmount', async () => {
    const onScan = vi.fn();
    const { unmount } = render(<QrCameraScanner onScan={onScan} locale="en" />);

    await screen.findByLabelText('Toggle flashlight');

    unmount();
    expect(mockTrack.stop).toHaveBeenCalled();
  });
});
