export function getCurrentWindow() {
  return {
    close: async () => {
      /* no-op in browser E2E */
    },
  };
}
