'use client';

import jsQR from 'jsqr';

interface DetectedBarcode {
  rawValue: string;
  format: string;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: {
        formats: string[];
      }): {
        detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
      };
      getSupportedFormats?(): Promise<string[]>;
    };
  }
}

export function createBarcodeDetector(): InstanceType<
  NonNullable<Window['BarcodeDetector']>
> | null {
  if (typeof window !== 'undefined' && window.BarcodeDetector) {
    try {
      return new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      return null;
    }
  }
  return null;
}

export async function detectQrInVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement | null,
  detector: InstanceType<NonNullable<Window['BarcodeDetector']>> | null,
): Promise<string | null> {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return null;

  if (detector) {
    try {
      const barcodes = await detector.detect(video);
      const first = barcodes[0];
      if (first?.rawValue) return first.rawValue;
    } catch {
      // Fallback to jsQR
    }
  }

  if (canvas) {
    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.floor(video.videoWidth * scale);
    const h = Math.floor(video.videoHeight * scale);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(video, 0, 0, w, h);
      try {
        const imgData = ctx.getImageData(0, 0, w, h);
        const code = jsQR(imgData.data, w, h, { inversionAttempts: 'dontInvert' });
        if (code?.data) return code.data;
      } catch {
        // Ignore frame extraction failure
      }
    }
  }

  return null;
}
