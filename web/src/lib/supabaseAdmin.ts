import "server-only";
import { createClient } from "@supabase/supabase-js";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.");
}

// Service-role client — bypasses RLS. Server-only, never exposed to the browser.
// Used for storage uploads (recipe/product photos) where the uploading user's
// own session doesn't need direct bucket access.
export const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PHOTOS_BUCKET = "photos";
let bucketEnsured = false;

async function ensurePhotosBucket() {
  if (bucketEnsured) return;
  const { data } = await supabaseAdmin.storage.getBucket(PHOTOS_BUCKET);
  if (!data) {
    await supabaseAdmin.storage.createBucket(PHOTOS_BUCKET, { public: true, fileSizeLimit: "5MB" });
  }
  bucketEnsured = true;
}

export async function uploadPhoto(path: string, file: File): Promise<string> {
  await ensurePhotosBucket();
  const buf = new Uint8Array(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage.from(PHOTOS_BUCKET).upload(path, buf, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  const { data } = supabaseAdmin.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Removes a previously-uploaded file given its public URL, so a rejected
// upload (wrong scan, wrong photo) doesn't linger in the bucket once the
// user picks a replacement. No-ops silently on a URL that isn't one of ours.
export async function deletePhoto(url: string): Promise<void> {
  const marker = `/storage/v1/object/public/${PHOTOS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(url.slice(idx + marker.length));
  await supabaseAdmin.storage.from(PHOTOS_BUCKET).remove([path]);
}

const DOCUMENTS_BUCKET = "documents";
let documentsBucketEnsured = false;

async function ensureDocumentsBucket() {
  if (documentsBucketEnsured) return;
  const { data } = await supabaseAdmin.storage.getBucket(DOCUMENTS_BUCKET);
  if (!data) {
    await supabaseAdmin.storage.createBucket(DOCUMENTS_BUCKET, { public: true, fileSizeLimit: "10MB" });
  }
  documentsBucketEnsured = true;
}

// Generated PDFs (POs, delivery notes) need a public URL so the WhatsApp
// Business Cloud API — which fetches the file itself from Meta's servers —
// can reach it. Plain localhost dev URLs aren't reachable from Meta, so
// these always go through Supabase Storage instead.
export async function uploadPdfBuffer(path: string, buffer: Buffer): Promise<string> {
  await ensureDocumentsBucket();
  const { error } = await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`PDF upload failed: ${error.message}`);
  const { data } = supabaseAdmin.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
