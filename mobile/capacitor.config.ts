import type { CapacitorConfig } from "@capacitor/cli";

// This app has no bundled web build of its own — it's a native shell that
// loads the real, already-deployed NAMA YOSO ERP directly (server actions,
// auth cookies, and everything else that isn't reproducible as a static
// export). `webDir` still has to point at *something* on disk (Capacitor
// requires it even in remote-server mode); `www/` holds only a placeholder
// that's never actually shown.
const config: CapacitorConfig = {
  appId: "com.namayoso.erp",
  appName: "NAMA YOSO",
  webDir: "www",
  server: {
    url: "https://nama-yoso-erp.onrender.com",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
