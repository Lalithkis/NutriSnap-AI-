import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { supabase } from "./supabase";

const MAX_DIM = 1280;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Downscale + re-encode to JPEG (also strips EXIF location metadata), then
 * upload to the user's private folder. Returns the storage path.
 */
export async function prepareAndUploadMealPhoto(uri: string, width: number, userId: string): Promise<{ path: string; localUri: string }> {
  const ctx = ImageManipulator.manipulate(uri);
  if (width > MAX_DIM) ctx.resize({ width: MAX_DIM });
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new Error("Could not process the photo");
  const bytes = base64ToBytes(saved.base64);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("Photo is too large even after compression");
  const path = `${userId}/${uuid()}.jpg`;
  const { error } = await supabase.storage.from("meal-images").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error("Upload failed. Check your connection and try again.");
  return { path, localUri: saved.uri };
}
