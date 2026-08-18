/**
 * Camera barcode scanner for phones and tablets.
 *
 * Uses the native BarcodeDetector API, which is available in Chrome / Edge on
 * Android and ChromeOS and in recent desktop Chromium. There is no polyfill
 * bundled, so on unsupported browsers (notably Safari/iOS and Firefox) this
 * component reports that clearly and tells the cashier to use the USB scanner
 * or type the barcode instead. It never silently pretends to work.
 *
 * Requires a secure context (https or localhost) for camera access.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Loader2, X, Zap } from 'lucide-react';
import { Language } from '../types';

interface CameraScannerProps {
  lang: Language;
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

type ScannerState = 'starting' | 'scanning' | 'unsupported' | 'denied' | 'error';

const SUPPORTED_FORMATS = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar',
];

function isSecure() {
  return typeof window !== 'undefined'
    && (window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
}

const CameraScanner: React.FC<CameraScannerProps> = ({ lang, onDetected, onClose }) => {
  const ar = lang === 'ar';
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const stoppedRef = useRef(false);
  // Debounce so one physical barcode doesn't fire dozens of times per second.
  const lastHitRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  const [state, setState] = useState<ScannerState>('starting');
  const [detail, setDetail] = useState('');
  const [lastCode, setLastCode] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    stop();
    onClose();
  }, [stop, onClose]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    try {
      const next = !torchOn;
      // `torch` is a real but non-standard constraint, so it isn't in the DOM types.
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  useEffect(() => {
    stoppedRef.current = false;

    const start = async () => {
      const AnyWindow = window as any;

      if (!isSecure()) {
        setState('unsupported');
        setDetail(ar
          ? 'الكاميرا تحتاج اتصالاً آمناً (HTTPS).'
          : 'Camera access requires a secure connection (HTTPS).');
        return;
      }

      if (!AnyWindow.BarcodeDetector) {
        setState('unsupported');
        setDetail(ar
          ? 'هذا المتصفح لا يدعم قراءة الباركود بالكاميرا. استخدم قارئ USB أو أدخل الباركود يدوياً.'
          : 'This browser cannot scan barcodes with the camera. Use a USB scanner or type the barcode.');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported');
        setDetail(ar ? 'لا توجد كاميرا متاحة.' : 'No camera available on this device.');
        return;
      }

      try {
        // Only request formats the device actually supports, otherwise construction can throw.
        let formats = SUPPORTED_FORMATS;
        try {
          const available: string[] = await AnyWindow.BarcodeDetector.getSupportedFormats();
          const intersection = SUPPORTED_FORMATS.filter(f => available.includes(f));
          if (intersection.length) formats = intersection;
        } catch {
          // Fall back to our default list.
        }
        detectorRef.current = new AnyWindow.BarcodeDetector({ formats });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stoppedRef.current) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as any;
        setTorchAvailable(!!caps?.torch);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setState('scanning');

        const tick = async () => {
          if (stoppedRef.current) return;
          const video = videoRef.current;
          if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
            try {
              const found = await detectorRef.current.detect(video);
              const value = found?.[0]?.rawValue?.trim();
              if (value) {
                const now = Date.now();
                const isRepeat = lastHitRef.current.value === value && now - lastHitRef.current.at < 1600;
                if (!isRepeat) {
                  lastHitRef.current = { value, at: now };
                  setLastCode(value);
                  if (navigator.vibrate) navigator.vibrate(60);
                  onDetected(value);
                }
              }
            } catch {
              // Transient decode failures are normal between frames.
            }
          }
          rafRef.current = requestAnimationFrame(() => { void tick(); });
        };
        void tick();
      } catch (err: any) {
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
          setState('denied');
          setDetail(ar
            ? 'تم رفض إذن الكاميرا. اسمح بالوصول من إعدادات المتصفح.'
            : 'Camera permission was denied. Allow access in your browser settings.');
        } else {
          setState('error');
          setDetail(err?.message || (ar ? 'تعذر تشغيل الكاميرا.' : 'Could not start the camera.'));
        }
      }
    };

    void start();
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ar, onDetected, stop]);

  const failed = state === 'unsupported' || state === 'denied' || state === 'error';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" dir={ar ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[#1E6B48] px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <Camera size={20} />
            <h3 className="text-base font-black">{ar ? 'مسح الباركود' : 'Scan Barcode'}</h3>
          </div>
          <div className="flex items-center gap-2">
            {torchAvailable && state === 'scanning' && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`icon-btn h-9 w-9 ${torchOn ? 'bg-white text-[#1E6B48]' : 'bg-white/20 text-white'}`}
                aria-label={ar ? 'الفلاش' : 'Torch'}
              >
                <Zap size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="icon-btn h-9 w-9 bg-white/20 text-white"
              aria-label={ar ? 'إغلاق' : 'Close'}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {failed ? (
          <div className="px-6 py-10 text-center">
            <CameraOff size={40} className="mx-auto mb-4 text-[#C2412D] opacity-70" />
            <p className="text-sm font-bold text-[#1C1C1E]">
              {state === 'denied'
                ? (ar ? 'لا يوجد إذن للكاميرا' : 'Camera permission needed')
                : (ar ? 'الكاميرا غير مدعومة' : 'Camera scanning unavailable')}
            </p>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-[#8E8E93]">{detail}</p>
            <button
              type="button"
              onClick={handleClose}
              className="mt-5 h-11 min-h-0 rounded-xl bg-[#1E6B48] px-6 text-sm font-black text-white"
            >
              {ar ? 'حسناً' : 'Got it'}
            </button>
          </div>
        ) : (
          <>
            <div className="relative aspect-[4/3] bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="h-full w-full object-cover"
              />
              {/* Reticle */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-32 w-[78%] rounded-2xl border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]">
                  <span className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 bg-[#34d399]/90" />
                </div>
              </div>
              {state === 'starting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white">
                  <Loader2 size={28} className="animate-spin" />
                  <p className="text-xs font-bold">{ar ? 'جارٍ تشغيل الكاميرا…' : 'Starting camera…'}</p>
                </div>
              )}
            </div>

            <div className="px-5 py-4">
              <p className="text-center text-xs font-semibold text-[#8E8E93]">
                {ar ? 'وجّه الكاميرا نحو الباركود' : 'Point the camera at the barcode'}
              </p>
              {lastCode && (
                <p className="mt-2 truncate rounded-xl bg-[var(--ios-accent-soft)] px-3 py-2 text-center font-mono text-sm font-bold text-[#1E6B48]">
                  {lastCode}
                </p>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="mt-3 h-11 min-h-0 w-full rounded-xl bg-[var(--ios-fill)] text-sm font-black text-[#1C1C1E]"
              >
                {ar ? 'إيقاف المسح' : 'Stop scanning'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CameraScanner;
