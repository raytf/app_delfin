import type { AnyObj } from "../types/common";

export interface HttpRequestOptions {
  headers?: AnyObj;
  params?: AnyObj;
}

export abstract class HttpRequestHelper {
  abstract get<T>(urlSuffix: string, options?: HttpRequestOptions): Promise<T>;
  abstract post<T>(
    urlSuffix: string,
    data?: AnyObj,
    options?: HttpRequestOptions,
  ): Promise<T>;
  abstract put<T>(
    urlSuffix: string,
    data?: AnyObj,
    options?: HttpRequestOptions,
  ): Promise<T>;
  abstract delete<T>(
    urlSuffix: string,
    options?: HttpRequestOptions,
  ): Promise<T>;
  abstract patch<T>(
    urlSuffix: string,
    data?: AnyObj,
    options?: HttpRequestOptions,
  ): Promise<T>;
}

export default HttpRequestHelper;
