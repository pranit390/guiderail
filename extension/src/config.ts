declare const __GUIDERAIL_HTTP__: string;
declare const __GUIDERAIL_WS__: string;

export const HTTP = __GUIDERAIL_HTTP__;
export const SERVER = __GUIDERAIL_WS__;
export const SERVER_HOST = new URL(HTTP).host;
