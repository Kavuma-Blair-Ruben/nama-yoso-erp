import fs from "fs";
import path from "path";

// react-pdf's <Image src="..."> treats a plain string as a URL and fetches
// it — a filesystem path isn't a valid URL, so that fetch silently fails
// and the image is just dropped (no error, no image, PDF still "succeeds").
// Reading the file into a Buffer ourselves and passing that as `src`
// sidesteps the fetch path entirely.
export const LOGO_BUFFER = fs.readFileSync(path.join(process.cwd(), "public", "brand", "nama-yoso-logo.png"));
export const LOGO_ASPECT = 1595 / 1219;
