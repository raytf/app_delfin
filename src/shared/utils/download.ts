import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import http, { IncomingMessage } from "node:http";
import https from "node:https";

export function downloadFile(
  url: string,
  dest: string,
  onProgress: (received: number, total?: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(dest), { recursive: true });
    const file = createWriteStream(dest);

    const client = url.startsWith("https:") ? https : http;
    const request = client.get(url, (response: IncomingMessage) => {
      if (
        response.statusCode === 301 ||
        response.statusCode === 302 ||
        response.statusCode === 307 ||
        response.statusCode === 308
      ) {
        file.close();
        const location = response.headers.location;
        if (!location) {
          reject(new Error("Redirect with no Location header"));
          return;
        }
        const redirectUrl = new URL(location, url).href;
        downloadFile(redirectUrl, dest, onProgress).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`Server returned status code ${response.statusCode}`));
        return;
      }

      const total = response.headers["content-length"]
        ? parseInt(response.headers["content-length"], 10)
        : undefined;
      let received = 0;

      response.on("data", (chunk) => {
        received += chunk.length;
        onProgress(received, total);
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve();
      });
    });

    request.on("error", (err) => {
      file.close();
      reject(err);
    });
  });
}
