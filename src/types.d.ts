declare module '@micropython/micropython-webassembly-pyscript/micropython.mjs' {
  export function loadMicroPython(opts?: Record<string, unknown>): Promise<any>;
}
declare module '*.wasm?url' {
  const url: string;
  export default url;
}
declare module '*?url' {
  const url: string;
  export default url;
}
