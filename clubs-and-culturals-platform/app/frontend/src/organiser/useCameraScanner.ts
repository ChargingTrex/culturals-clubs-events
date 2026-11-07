/**
 * Continuous QR read from the rear camera with the browser's BarcodeDetector.
 *
 * Feature-detected: where the API or a camera is missing (Firefox, iOS < 17,
 * desktop without a webcam) `supported` is false and the station falls back
 * to typed entry and PRN lookup. The same code is not reported twice within
 * `cooldownMs`, so a pass held in front of the lens counts once.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function detectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === 'function' ? ctor : null;
}

export const cameraSupported = (): boolean =>
  detectorCtor() !== null &&
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function';

export type CameraState = 'off' | 'starting' | 'on' | 'error';

export function useCameraScanner(onCode: (code: string) => void, cooldownMs = 2500) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const onCodeRef = useRef(onCode);
  const [state, setState] = useState<CameraState>('off');
  const [error, setError] = useState('');

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState('off');
  }, []);

  const start = useCallback(async () => {
    const Ctor = detectorCtor();
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot read QR codes from the camera. Type the code or use the PRN.');
      setState('error');
      return;
    }
    setState('starting');
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      const detector = new Ctor({ formats: ['qr_code'] });
      let busy = false;
      timerRef.current = window.setInterval(async () => {
        const v = videoRef.current;
        if (busy || !v || v.readyState < 2) return;
        busy = true;
        try {
          const codes = await detector.detect(v);
          const code = codes[0]?.rawValue?.trim();
          if (code) {
            const now = Date.now();
            const last = lastRef.current;
            if (code !== last.code || now - last.at > cooldownMs) {
              lastRef.current = { code, at: now };
              onCodeRef.current(code);
            }
          }
        } catch {
          // A frame that fails to decode is not an error worth showing.
        } finally {
          busy = false;
        }
      }, 200);
      setState('on');
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === 'NotAllowedError'
          ? 'Camera permission was refused. Allow it in the browser, or type the code.'
          : 'No camera could be opened. Type the code or use the PRN.',
      );
      setState('error');
    }
  }, [cooldownMs]);

  useEffect(() => stop, [stop]);

  return { videoRef, state, error, start, stop };
}
