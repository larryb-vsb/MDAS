import { QueryClient, QueryFunction, useQueryClient } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export type RequestOptions = {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
};

export async function apiRequest<T = Response>(
  input: string | Request | URL,
  init?: RequestOptions
): Promise<T> {
  const method = init?.method || 'GET';
  const headers = {
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...init?.headers
  };
  
  const requestInit: RequestInit = {
    method,
    headers,
    credentials: "include",
  };
  
  if (init?.body) {
    requestInit.body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
  }
  
  const res = await fetch(input, requestInit);
  await throwIfResNotOk(res);
  
  // Check if there's content to parse
  const contentType = res.headers.get('content-type');
  
  // If response is empty or not JSON, return an empty object
  if (res.status === 204 || !contentType || !contentType.includes('application/json')) {
    return {} as T;
  }
  
  // Try to parse JSON
  const data = await res.json();
  return data as T;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    
    // Check if there's content to parse
    const contentType = res.headers.get('content-type');
    
    // If response is empty or not JSON, return an empty object
    if (res.status === 204 || !contentType || !contentType.includes('application/json')) {
      return {} as any;
    }
    
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Re-export useQueryClient for convenience
export { useQueryClient };
