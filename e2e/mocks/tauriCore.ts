const fixtureInvoice = {
  companyNo: "1000",
  proNo: "01",
  salesDate: "2026-01-15",
  invoice: 1,
  orderNo: 0,
  orderDate: null,
  orderMan: "MGR",
  salesUnit: "A1",
  salesSize: "",
  salesTotal: 250,
  salesPay: 0,
  salesBal: 250,
  payTotal: 0,
  balance: 250,
  salesTerm: "Net  7 Days",
  salesDue: null,
  custPoNo: "",
  discountOn: 0,
  discount: 0,
  depositRef: "",
  remark1: "",
  remark2: "",
  status: "",
  voided: false,
  companyName: "ACME",
  propertyName: "Bldg A",
  propertyStreet: null,
};

export async function invoke<T = unknown>(
  cmd: string,
  _args?: Record<string, unknown>
): Promise<T> {
  if (cmd === "get_db_path") {
    return "C:\\mock\\promas.db" as T;
  }
  if (cmd === "get_backend_diagnostics") {
    return {
      dbPath: "C:\\mock\\promas.db",
      logDir: "C:\\mock\\logs",
      rustVersion: "x86_64-windows",
      crateVersion: "2.0.0",
      targetTriple: "x86_64-pc-windows-msvc",
    } as T;
  }
  if (cmd === "open_log_dir") {
    return undefined as T;
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
  if (cmd === "list_invoices") {
    return [fixtureInvoice] as T;
  }
  if (cmd === "list_companies") {
    return [
      {
        companyNo: "1000",
        name: "ACME",
        class: "A",
        street: "",
        city: "",
        state: "CA",
        zip: "",
        phone: "",
        phone2: "",
        contact: "",
        attn: "",
        fax: "",
        remark1: "",
        remark2: "",
        enterDate: null,
        voided: false,
      },
    ] as T;
  }
  if (cmd === "list_properties") {
    return [
      {
        companyNo: "1000",
        proNo: "01",
        name: "Bldg A",
        class: "",
        street: "",
        city: "",
        state: "",
        zip: "",
        phone: "",
        phone2: "",
        contact: "",
        noOfUnit: 0,
        manager: "",
        pageMap: "",
        keyInfo: "",
        paintTime: "",
        comment1: "",
        comment2: "",
        memo: "",
        voided: false,
      },
    ] as T;
  }
  if (cmd === "list_employees" || cmd === "list_work_types") {
    return [] as T;
  }
  if (cmd === "get_invoice") {
    return {
      invoice: fixtureInvoice,
      lines: [
        {
          companyNo: "1000",
          proNo: "01",
          salesDate: "2026-01-15",
          invoice: 1,
          lineNo: 1,
          codeNo: "*",
          description: "Paint",
          workDate: "2026-01-15",
          workType: "P",
          price: 250,
          empNo: "",
          empPrice: 0,
          commission: 65,
          status: "",
        },
      ],
    } as T;
  }
  throw new Error(`E2E mock: unhandled invoke "${cmd}"`);
}
