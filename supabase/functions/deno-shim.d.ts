// Type shim so the edge functions can be type-checked with tsc in CI (they run on Deno).
declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
  const env: { get(name: string): string | undefined };
}
