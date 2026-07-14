'use client';

import React, { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import { Upload, X, ImageOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';

interface ImageUploadProps {
  currentImageUrl?: string | null;
  onImageUploaded: (url: string) => void;
  onImageRemoved: () => void;
  productId?: string;
  className?: string;
}

const MAX_SIZE_MB = 2;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const BUCKET = 'product-images';

/**
 * Compress an image File to a target max dimension while preserving aspect ratio.
 */
async function compressImage(file: File, maxPx = 800): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const { width, height } = img;
      let newW = width;
      let newH = height;

      if (width > maxPx || height > maxPx) {
        if (width > height) {
          newW = maxPx;
          newH = Math.round((height / width) * maxPx);
        } else {
          newH = maxPx;
          newW = Math.round((width / height) * maxPx);
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, newW, newH);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Compression failed'));
        },
        'image/webp',
        0.82
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function ImageUpload({
  currentImageUrl,
  onImageUploaded,
  onImageRemoved,
  productId,
  className,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentImageUrl ?? null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      // Validate type
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error('Please upload a JPEG, PNG, WebP or AVIF image');
        return;
      }
      // Validate size
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        toast.error(`Image must be smaller than ${MAX_SIZE_MB}MB`);
        return;
      }

      setIsUploading(true);
      // Show local preview immediately
      const localUrl = URL.createObjectURL(file);
      setPreview(localUrl);

      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Compress
        let blob: Blob;
        try {
          blob = await compressImage(file);
        } catch {
          blob = file; // Use original if compression fails
        }

        // Build path: products/{userId}/{uuid}.webp
        const ext = 'webp';
        const fileName = `${productId ?? crypto.randomUUID()}-${Date.now()}.${ext}`;
        const path = `${user.id}/${fileName}`;

        // Upload to Supabase Storage
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, {
            contentType: 'image/webp',
            upsert: true,
          });

        if (uploadErr) throw uploadErr;

        // Get public URL
        const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const publicUrl = publicData.publicUrl;

        // Update preview to the real URL
        setPreview(publicUrl);
        onImageUploaded(publicUrl);
        toast.success('Image uploaded successfully');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        toast.error(msg);
        // Revert preview
        setPreview(currentImageUrl ?? null);
      } finally {
        setIsUploading(false);
        // Clean up object URL
        URL.revokeObjectURL(localUrl);
      }
    },
    [currentImageUrl, onImageUploaded, productId]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleRemove = async () => {
    if (preview && preview.includes('supabase')) {
      try {
        const supabase = createClient();
        // Extract path from URL
        const url = new URL(preview);
        const parts = url.pathname.split(`/${BUCKET}/`);
        if (parts[1]) {
          await supabase.storage.from(BUCKET).remove([parts[1]]);
        }
      } catch {
        // Ignore storage removal errors
      }
    }
    setPreview(null);
    onImageRemoved();
    toast.success('Image removed');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div className={cn('space-y-2', className)}>
      {preview ? (
        /* Image preview */
        <div className="relative group rounded-lg overflow-hidden border border-border bg-muted w-full aspect-square max-w-48">
          <Image
            src={preview}
            alt="Product image"
            fill
            className="object-cover"
            sizes="192px"
            loading="lazy"
          />
          {isUploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
          )}
          {!isUploading && (
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                onClick={() => inputRef.current?.click()}
                title="Replace image"
              >
                <Upload className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="destructive"
                onClick={handleRemove}
                title="Remove image"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Drop zone */
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors max-w-48 aspect-square',
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          {isUploading ? (
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <ImageOff className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-xs font-medium text-muted-foreground">
                  Click or drag to upload
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  JPG, PNG, WebP · Max {MAX_SIZE_MB}MB
                </p>
              </div>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
