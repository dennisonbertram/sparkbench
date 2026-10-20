// Minimal types for @jscad/stl-serializer (CommonJS, no bundled types).
declare module '@jscad/stl-serializer' {
  export function serialize(options: { binary?: boolean }, ...objects: unknown[]): ArrayBuffer[] | string[];
  const _default: { serialize: typeof serialize };
  export default _default;
}
