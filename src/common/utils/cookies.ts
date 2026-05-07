import type { AxiosInstance } from "axios";

export type CookieJar = Record<string, string>;

export function cookiesRequestInterceptor(
  client: AxiosInstance,
  jar: CookieJar,
): void {
  client.interceptors.request.use((config) => {
    const cookies = Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    if (cookies) {
      config.headers.set("Cookie", cookies);
    }
    return config;
  });
}

export function cookiesResponseInterceptor(
  client: AxiosInstance,
  jar: CookieJar,
): void {
  client.interceptors.response.use((response) => {
    const setCookie = response.headers["set-cookie"];
    if (Array.isArray(setCookie)) {
      for (const raw of setCookie) {
        const [pair] = raw.split(";");
        const eq = pair.indexOf("=");
        if (eq <= 0) continue;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        jar[name] = value;
      }
    }
    return response;
  });
}
