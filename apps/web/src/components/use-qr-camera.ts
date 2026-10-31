'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@/lib/locales';
import { createBarcodeDetector, detectQrInVideo } from './qr-frame-detector';

export interface UseQrCameraOptions {
  onScan: (token: string) => void;
  locale: Locale;
  paused?: boolean;
}

export function useQrCamera({ onScan, locale, paused = false }: UseQrCameraOptions) {
  const isAr = locale === 'ar';
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const hasScannedRef = useRef(false);

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore cleanup errors
        }
      }
      streamRef.current = null;
    }
    if (loopRef.current) {
      cancelAnimationFrame(loopRef.current);
      loopRef.current = null;
    }
  }, []);

  const handleDetected = useCallback(
    (detected: string) => {
      const clean = detected.trim();
      if (!clean || hasScannedRef.current) return;
      hasScannedRef.current = true;
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(80);
        }
      } catch {
        // ignore vibration
      }
      onScan(clean);
    },
    [onScan],
  );

  useEffect(() => {
    let mounted = true;
    hasScannedRef.current = false;
    setScannerReady(false);
    setErrorMessage(null);

    async function startCamera() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        if (mounted) {
          setHasPermission(false);
          setErrorMessage(
            isAr
              ? 'المتصفح لا يدعم الوصول إلى الكاميرا في هذا الوضع.'
              : 'Camera access is not supported by your browser.',
          );
        }
        return;
      }

      stopTracks();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (!mounted) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        streamRef.current = stream;
        setHasPermission(true);

        const track = stream.getVideoTracks()[0];
        if (track) {
          try {
            const capabilities = track.getCapabilities?.() as
              | (MediaTrackCapabilities & { torch?: boolean })
              | undefined;
            setTorchAvailable(Boolean(capabilities?.torch));
          } catch {
            setTorchAvailable(false);
          }
        }

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setCanSwitchCamera(videoInputs.length > 1);
        } catch {
          setCanSwitchCamera(false);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          if (mounted) setScannerReady(true);
        }
      } catch (err: unknown) {
        if (!mounted) return;
        setHasPermission(false);
        const name = (err as Error)?.name || '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setErrorMessage(
            isAr
              ? 'تم رفض إذن الكاميرا. يُرجى تفعيل إذن الكاميرا من إعدادات المتصفح.'
              : 'Camera access was denied. Please grant camera permissions in your browser.',
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setErrorMessage(
            isAr ? 'لم يتم العثور على كاميرا في هذا الجهاز.' : 'No camera found on this device.',
          );
        } else {
          setErrorMessage(
            isAr
              ? 'تعذر تشغيل الكاميرا. يرجى التأكد من عدم استخدامها بواسطة تطبيق آخر.'
              : 'Could not start camera. Make sure it is not in use by another app.',
          );
        }
      }
    }

    startCamera();

    return () => {
      mounted = false;
      stopTracks();
    };
  }, [facingMode, isAr, stopTracks]);

  useEffect(() => {
    if (!scannerReady || paused || hasPermission === false) return;

    const detector = createBarcodeDetector();
    let active = true;
    let lastScanTime = 0;

    async function scanFrame(timestamp: number) {
      if (!active || hasScannedRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (
        timestamp - lastScanTime >= 100 &&
        video &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        lastScanTime = timestamp;
        const found = await detectQrInVideo(video, canvas, detector);
        if (found && active) {
          handleDetected(found);
          return;
        }
      }

      if (active && !hasScannedRef.current) {
        loopRef.current = requestAnimationFrame(scanFrame);
      }
    }

    loopRef.current = requestAnimationFrame(scanFrame);

    return () => {
      active = false;
      if (loopRef.current) {
        cancelAnimationFrame(loopRef.current);
        loopRef.current = null;
      }
    };
  }, [scannerReady, paused, hasPermission, handleDetected]);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !torchOn;
      interface TorchTrack extends MediaStreamTrack {
        applyConstraints(
          constraints?: MediaTrackConstraints & { advanced?: Array<{ torch?: boolean }> },
        ): Promise<void>;
      }
      await (track as TorchTrack).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch {
      // Torch constraint failed
    }
  };

  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return {
    videoRef,
    canvasRef,
    scannerReady,
    errorMessage,
    torchAvailable,
    torchOn,
    toggleTorch,
    canSwitchCamera,
    toggleFacingMode,
    isAr,
  };
}
