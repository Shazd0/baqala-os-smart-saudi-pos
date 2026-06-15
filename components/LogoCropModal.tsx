import React, { useEffect, useMemo, useState } from 'react';
import { Check, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { processLogoFile, type LogoCropArea } from '../services/logoService';

interface LogoCropModalProps {
  file: File;
  onCancel: () => void;
  onApply: (dataUrl: string) => void;
}

function cropFromControls(width: number, height: number, zoom: number, offsetX: number, offsetY: number): LogoCropArea {
  const size = Math.min(width, height) / zoom;
  const maxX = Math.max(0, (width - size) / 2);
  const maxY = Math.max(0, (height - size) / 2);
  return {
    x: (width - size) / 2 + (offsetX / 100) * maxX,
    y: (height - size) / 2 + (offsetY / 100) * maxY,
    width: size,
    height: size,
  };
}

const LogoCropModal: React.FC<LogoCropModalProps> = ({ file, onCancel, onApply }) => {
  const [imageUrl, setImageUrl] = useState('');
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setSize({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
      setImageUrl(url);
    };
    image.onerror = () => {
      setError('Unable to preview this image.');
      URL.revokeObjectURL(url);
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const previewTransform = useMemo(() => {
    const translateX = -offsetX * 0.35;
    const translateY = -offsetY * 0.35;
    return `translate(${translateX}%, ${translateY}%) scale(${zoom})`;
  }, [offsetX, offsetY, zoom]);

  const applyCrop = async () => {
    setProcessing(true);
    setError('');
    try {
      const crop = cropFromControls(size.width, size.height, zoom, offsetX, offsetY);
      const processed = await processLogoFile(file, crop);
      onApply(processed.dataUrl);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : 'Unable to crop this logo.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-slate-100 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-[#007AFF]">
              <ImageIcon size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Crop Restaurant Logo</h2>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-400">
                Adjust the logo manually before saving it to receipts and reports.
              </p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="rounded-xl bg-slate-100 p-2 text-slate-500 transition-all active:scale-[0.97]">
            <X size={18} />
          </button>
        </div>

        <div className="mx-auto flex h-72 w-72 items-center justify-center overflow-hidden rounded-[28px] border border-dashed border-slate-300 bg-[#F2F2F7]">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Logo crop preview"
              className="h-full w-full object-contain transition-transform duration-200"
              style={{ transform: previewTransform }}
            />
          ) : (
            <Loader2 className="animate-spin text-[#007AFF]" />
          )}
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-xs font-bold text-slate-700">
            Zoom
            <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={event => setZoom(Number(event.target.value))} />
          </label>
          <label className="grid gap-2 text-xs font-bold text-slate-700">
            Move Horizontally
            <input type="range" min="-100" max="100" step="1" value={offsetX} onChange={event => setOffsetX(Number(event.target.value))} />
          </label>
          <label className="grid gap-2 text-xs font-bold text-slate-700">
            Move Vertically
            <input type="range" min="-100" max="100" step="1" value={offsetY} onChange={event => setOffsetY(Number(event.target.value))} />
          </label>
        </div>

        {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div>}

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 transition-all active:scale-[0.97]">
            Cancel
          </button>
          <button
            type="button"
            onClick={applyCrop}
            disabled={processing}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#007AFF] px-4 py-3 text-sm font-bold text-white shadow-[0_12px_30px_rgba(0,122,255,0.22)] transition-all active:scale-[0.97] disabled:opacity-60"
          >
            {processing ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoCropModal;
