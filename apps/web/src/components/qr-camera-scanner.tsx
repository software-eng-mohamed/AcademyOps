'use client';

import { AlertCircle, Camera, Flashlight, FlashlightOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/base/buttons/button';
import { useQrCamera } from '@/components/use-qr-camera';
import type { Locale } from '@/lib/locales';

export interface QrCameraScannerProps {
  onScan: (token: string) => void;
  locale: Locale;
  paused?: boolean;
  onFallbackManual?: () => void;
  promptText?: string;
  className?: string;
}

export function QrCameraScanner({
  onScan,
  locale,
  paused = false,
  onFallbackManual,
  promptText,
  className = '',
}: QrCameraScannerProps) {
  const {
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
  } = useQrCamera({ onScan, locale, paused });

  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-2xl bg-neutral-900 text-white ${className}`}
    >
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Video Viewport */}
      <div className="relative aspect-square w-full max-w-[360px] overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted autoPlay playsInline />

        {/* Viewfinder Target Reticle */}
        {scannerReady && !errorMessage ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {/* Darkened overlay edges */}
            <div className="absolute inset-0 bg-black/35" />

            {/* Clear central scan window */}
            <div className="relative z-10 h-56 w-56 rounded-2xl border-2 border-emerald-400/80 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]">
              {/* Corner brackets */}
              <div className="absolute -start-1 -top-1 h-5 w-5 rounded-tl-lg border-s-4 border-t-4 border-emerald-400" />
              <div className="absolute -end-1 -top-1 h-5 w-5 rounded-tr-lg border-e-4 border-t-4 border-emerald-400" />
              <div className="absolute -bottom-1 -start-1 h-5 w-5 rounded-bl-lg border-b-4 border-s-4 border-emerald-400" />
              <div className="absolute -bottom-1 -end-1 h-5 w-5 rounded-br-lg border-b-4 border-e-4 border-emerald-400" />

              {/* Animated laser line */}
              <div className="absolute inset-x-2 top-2 h-0.5 animate-pulse bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#34d399]" />
            </div>
          </div>
        ) : null}

        {/* Error / Permission Denied State */}
        {errorMessage ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-neutral-900/95 p-6 text-center">
            <AlertCircle className="h-10 w-10 text-rose-400" />
            <p className="text-sm text-neutral-200">{errorMessage}</p>
            {onFallbackManual ? (
              <Button
                variant="secondary"
                size="small"
                onClick={onFallbackManual}
                className="mt-2 text-xs"
              >
                {isAr ? 'الانتقال للإدخال اليدوي' : 'Use manual input'}
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Camera Starting / Loading State */}
        {!scannerReady && !errorMessage ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-900/80 p-4 text-center">
            <Camera className="h-8 w-8 animate-pulse text-emerald-400" />
            <p className="text-xs text-neutral-300">
              {isAr ? 'جاري تشغيل كاميرا الموبايل...' : 'Starting mobile camera...'}
            </p>
          </div>
        ) : null}

        {/* Mobile Toolbar Overlay */}
        {scannerReady && !errorMessage ? (
          <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-4 px-4">
            {torchAvailable ? (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label={isAr ? 'تشغيل الكشاف' : 'Toggle flashlight'}
                className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md transition-colors ${
                  torchOn
                    ? 'bg-amber-400 text-neutral-950'
                    : 'bg-black/50 text-white hover:bg-black/70'
                }`}
              >
                {torchOn ? (
                  <Flashlight className="h-5 w-5" />
                ) : (
                  <FlashlightOff className="h-5 w-5" />
                )}
              </button>
            ) : null}

            {canSwitchCamera ? (
              <button
                type="button"
                onClick={toggleFacingMode}
                aria-label={isAr ? 'تبديل الكاميرا' : 'Switch camera'}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md hover:bg-black/70"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Guide text under viewfinder */}
      <p className="mt-3 text-center text-xs text-neutral-400">
        {promptText ||
          (isAr
            ? 'وجّه كاميرا الموبايل نحو رمز الـ QR داخل الإطار'
            : 'Point mobile camera at the QR code inside frame')}
      </p>
    </div>
  );
}
