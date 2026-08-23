import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Plain Node.js server output — no Vercel-specific APIs — so this deploys
  // cleanly to Render.com (or any Node host) as a standard web service.
  output: "standalone",
  experimental: {
    // Server Actions default to a 1MB request body cap — too small for the
    // recipe-photo and GRN-invoice-scan uploads (uploadRecipePhoto,
    // uploadGrnInvoice), which send the file straight through a Server
    // Action as FormData. Raised to match the Supabase Storage bucket's own
    // 5MB fileSizeLimit (see src/lib/supabaseAdmin.ts), with headroom.
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
