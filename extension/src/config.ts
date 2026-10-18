declare const __GUIDERAIL_HTTP__: string;
declare const __GUIDERAIL_WS__: string;
declare const __GUIDERAIL_FIREBASE_API_KEY__: string;

export const HTTP = __GUIDERAIL_HTTP__;
export const SERVER = __GUIDERAIL_WS__;
export const SERVER_HOST = new URL(HTTP).host;
// Empty in local development builds: sign-in is off and no Authorization header is sent.
export const FIREBASE_API_KEY = __GUIDERAIL_FIREBASE_API_KEY__;
