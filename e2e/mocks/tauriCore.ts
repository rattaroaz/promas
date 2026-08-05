export async function invoke<T = unknown>(
  cmd: string,
  _args?: Record<string, unknown>
): Promise<T> {
  if (cmd === "get_db_path") {
    return "C:\\mock\\promas.db" as T;
  }
  if (cmd === "get_sysdata") {
    return {
      company: "Test Co",
      address1: "",
      address2: "",
      city: "",
      zip: "",
      closeDate: null,
      nextInvoice: 1,
      nextOrder: 1,
      nextEstimate: 1,
      termsDays: 7,
      interestRate: 1.5,
    } as T;
  }
  throw new Error(`E2E mock: unhandled invoke "${cmd}"`);
}
