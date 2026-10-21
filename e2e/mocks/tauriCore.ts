type E2EWorkPerson = { name: string; workerNo: string; active: boolean };

/** Seeded the way a migrated catalog is: current dropdown names, Active, blank numbers. */
let workPersons: E2EWorkPerson[] = [
  { name: "Jose Ramirez", workerNo: "", active: true },
];

function listWorkPersons(): E2EWorkPerson[] {
  return [...workPersons].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

const fixtureCompany = {
  companyNo: "1000",
  name: "ACME",
  class: "A",
  street: "",
  city: "",
  state: "CA",
  zip: "",
  phone: "",
  phone2: "",
  phone3: "",
  phone4: "(818) 555-0199",
  contact: "ELAINE",
  attn: "",
  fax: "(818) 555-0199",
  pageMap: "",
  lastProId: 0,
  memo: "elaine@acme.example",
  remark1: "",
  remark2: "",
  enterDate: null,
  voided: false,
};

const fixtureCompany2 = {
  ...fixtureCompany,
  companyNo: "2000",
  name: "BAYSIDE",
  class: "B",
};

const fixtureCompany3 = {
  ...fixtureCompany,
  companyNo: "1500",
  name: "CEDAR",
  class: "C",
};

type E2EProperty = {
  companyNo: string;
  proNo: string;
  name: string;
  class: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  phone2: string;
  contact: string;
  noOfUnit: number;
  manager: string;
  pageMap: string;
  keyInfo: string;
  paintTime: string;
  comment1: string;
  comment2: string;
  memo: string;
  voided: boolean;
};

/** Returned in stored order. The street picker used to show this order as-is. */
let properties: E2EProperty[] = [
  {
    companyNo: "1000",
    proNo: "01",
    name: "Bldg A",
    class: "",
    street: "14755 NORTH VENTURA CANYON AVENUE BUILDING A1",
    city: "SHERMAN OAKS",
    state: "CA",
    zip: "91403",
    phone: "(818) 555-0191",
    phone2: "(818) 555-0143",
    contact: "MARIA GONZALEZ",
    noOfUnit: 24,
    manager: "MARIA GONZALEZ",
    pageMap: "LB 1984",
    keyInfo: "*2424",
    paintTime: "NAVAJO WHITE",
    comment1: "Pick up key from the rental office.",
    comment2: "Lock box 1984 on the front gate.",
    memo: "",
    voided: false,
  },
  {
    companyNo: "1000",
    proNo: "02",
    name: "Bldg B",
    class: "",
    street: "88 MAIN ST",
    city: "RANCHO SANTA MARGARITA",
    state: "CA",
    zip: "91335",
    phone: "(818) 555-0102",
    phone2: "",
    contact: "ROSA DIAZ",
    noOfUnit: 8,
    manager: "ROSA DIAZ",
    pageMap: "",
    keyInfo: "",
    paintTime: "",
    comment1: "",
    comment2: "",
    memo: "",
    voided: false,
  },
  {
    companyNo: "1500",
    proNo: "01",
    name: "Cedar Court",
    class: "",
    street: "100 ELM ROAD",
    city: "RESEDA",
    state: "CA",
    zip: "91335",
    phone: "(818) 555-0150",
    phone2: "",
    contact: "CEDAR DESK",
    noOfUnit: 4,
    manager: "CEDAR DESK",
    pageMap: "",
    keyInfo: "",
    paintTime: "",
    comment1: "",
    comment2: "",
    memo: "",
    voided: false,
  },
  {
    companyNo: "2000",
    proNo: "01",
    name: "Oak House",
    class: "",
    street: "10 OAK AVENUE",
    city: "VAN NUYS",
    state: "CA",
    zip: "91401",
    phone: "(818) 555-0201",
    phone2: "",
    contact: "OAK DESK",
    noOfUnit: 2,
    manager: "OAK DESK",
    pageMap: "office@bayside.example",
    keyInfo: "#1001",
    paintTime: "4400",
    comment1: "",
    comment2: "",
    memo: "",
    voided: false,
  },
  {
    companyNo: "2000",
    proNo: "02",
    name: "Pine House",
    class: "",
    street: "9 PINE STREET",
    city: "VAN NUYS",
    state: "CA",
    zip: "91401",
    phone: "(818) 555-0202",
    phone2: "",
    contact: "PINE DESK",
    noOfUnit: 2,
    manager: "PINE DESK",
    pageMap: "",
    keyInfo: "",
    paintTime: "",
    comment1: "",
    comment2: "",
    memo: "",
    voided: false,
  },
];

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
  materialCost: 0,
  paintSupplyCo: "",
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
  if (cmd === "save_text_file") {
    return undefined as T;
  }
  if (cmd === "confirm_quit") {
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
      nextInvoice: 2,
      nextOrder: 1,
      nextEstimate: 1,
      termsDays: 7,
      interestRate: 1.5,
    } as T;
  }
  if (cmd === "save_sysdata") {
    return undefined as T;
  }
  if (cmd === "list_forms") {
    return [] as T;
  }
  if (cmd === "save_form") {
    return undefined as T;
  }
  if (cmd === "list_invoices") {
    // Property 01 keeps the original open invoice. The other rows are only
    // for the cash ledger: unpaid invoices above paid ones, oldest first.
    return [
      fixtureInvoice,
      {
        ...fixtureInvoice,
        proNo: "02",
        salesDate: "2026-01-01",
        invoice: 3,
        salesTotal: 80,
        salesBal: 80,
        payTotal: 0,
        balance: 80,
      },
      {
        ...fixtureInvoice,
        proNo: "02",
        salesDate: "2026-03-01",
        invoice: 4,
        salesTotal: 40,
        salesBal: 40,
        payTotal: 0,
        balance: 40,
      },
      {
        ...fixtureInvoice,
        proNo: "02",
        salesDate: "2025-06-01",
        invoice: 5,
        salesTotal: 60,
        salesBal: 0,
        payTotal: 60,
        balance: 0,
      },
      {
        ...fixtureInvoice,
        proNo: "02",
        salesDate: "2026-02-01",
        invoice: 6,
        salesTotal: 90,
        salesBal: 0,
        payTotal: 90,
        balance: 0,
      },
    ] as T;
  }
  if (cmd === "list_companies") {
    return [fixtureCompany, fixtureCompany2, fixtureCompany3] as T;
  }
  if (cmd === "get_company") {
    const companyNo = String(_args?.companyNo ?? "").trim();
    const found = [fixtureCompany, fixtureCompany2, fixtureCompany3].find(
      (company) => company.companyNo === companyNo
    );
    return (found ?? null) as T;
  }
  if (cmd === "next_company_no") {
    return "1001" as T;
  }
  if (cmd === "save_company") {
    return undefined as T;
  }
  if (cmd === "save_property") {
    const property = (_args?.property ?? {}) as E2EProperty;
    const companyNo = String(property.companyNo ?? "").trim();
    const proNo = String(property.proNo ?? "").trim();
    const index = properties.findIndex(
      (row) => row.companyNo === companyNo && row.proNo === proNo
    );
    if (index >= 0) properties[index] = { ...properties[index], ...property };
    else properties.push({ ...property });
    return undefined as T;
  }
  if (cmd === "delete_company") {
    return undefined as T;
  }
  if (cmd === "list_properties") {
    const params = (_args?.params ?? {}) as {
      companyNo?: string;
      search?: string;
    };
    const companyNo = String(params.companyNo ?? "").trim();
    const search = String(params.search ?? "").trim().toLowerCase();
    let rows = properties;
    if (companyNo) rows = rows.filter((row) => row.companyNo === companyNo);
    if (search) {
      rows = rows.filter((row) =>
        [row.street, row.name, row.proNo, row.contact, row.city, row.companyNo]
          .join(" ")
          .toLowerCase()
          .includes(search)
      );
    }
    return rows.map((row) => ({ ...row })) as T;
  }
  if (cmd === "list_employees" || cmd === "list_work_types") {
    return [] as T;
  }
  if (cmd === "save_employee") {
    return undefined as T;
  }
  if (cmd === "delete_employee") {
    return undefined as T;
  }
  if (cmd === "save_work_type") {
    return undefined as T;
  }
  if (cmd === "delete_work_type") {
    return undefined as T;
  }
  if (cmd === "list_work_persons") {
    return listWorkPersons() as T;
  }
  if (cmd === "save_work_person") {
    const person = (_args?.person ?? {}) as {
      name?: string;
      workerNo?: string;
      active?: boolean;
      originalName?: string;
    };
    const name = String(person.name ?? "").trim();
    if (!name) throw new Error("Work person name required");
    const original = String(person.originalName ?? "").trim();
    const key = (original || name).toLowerCase();
    const next = {
      name,
      workerNo: String(person.workerNo ?? ""),
      active: person.active !== false,
    };
    const idx = workPersons.findIndex((p) => p.name.toLowerCase() === key);
    if (idx >= 0) workPersons[idx] = next;
    else workPersons.push(next);
    return listWorkPersons() as T;
  }
  if (cmd === "delete_work_person") {
    const name = String(_args?.name ?? "").trim().toLowerCase();
    workPersons = workPersons.filter((p) => p.name.toLowerCase() !== name);
    return listWorkPersons() as T;
  }
  if (cmd === "list_paint_supply_cos") {
    return [] as T;
  }
  if (cmd === "save_paint_supply_co") {
    const name = String(_args?.name ?? "").trim();
    return (name ? [name] : []) as T;
  }
  if (cmd === "delete_paint_supply_co") {
    return [] as T;
  }
  if (cmd === "report_paint_usage") {
    return [] as T;
  }
  if (cmd === "report_payroll") {
    return [] as T;
  }
  if (cmd === "list_work_orders") {
    return [
      {
        companyNo: "1000",
        proNo: "01",
        orderDate: "2026-02-01",
        orderNo: 7,
        workDate: "2026-02-02",
        orderUnit: "A1",
        orderSize: "",
        orderMan: "MGR",
        orderBy: "",
        custPoNo: "",
        remark1: "",
        remark2: "",
        status: "",
        voided: false,
        companyName: "ACME",
        propertyName: "Bldg A",
      },
    ] as T;
  }
  if (cmd === "save_work_order") {
    return 8 as T;
  }
  if (cmd === "void_work_order") {
    return undefined as T;
  }
  if (cmd === "get_work_order") {
    return {
      order: {
        companyNo: "1000",
        proNo: "01",
        orderDate: "2026-02-01",
        orderNo: 7,
        workDate: "2026-02-02",
        orderUnit: "A1",
        orderSize: "",
        orderMan: "MGR",
        orderBy: "",
        custPoNo: "",
        remark1: "",
        remark2: "",
        status: "",
        voided: false,
        companyName: "ACME",
        propertyName: "Bldg A",
      },
      lines: [
        {
          companyNo: "1000",
          proNo: "01",
          orderDate: "2026-02-01",
          orderNo: 7,
          lineNo: 1,
          codeNo: "*",
          description: "Prep",
          workType: "P",
          price: 100,
        },
      ],
    } as T;
  }
  if (cmd === "list_estimates") {
    return [
      {
        id: 5,
        companyNo: "1000",
        estDate: "2026-03-01",
        estNo: 12,
        formNo: "EST-1",
        memo: "",
        status: "",
        voided: false,
      },
    ] as T;
  }
  if (cmd === "save_estimate") {
    return 13 as T;
  }
  if (cmd === "void_estimate") {
    return undefined as T;
  }
  if (cmd === "save_cash_receipt") {
    return undefined as T;
  }
  if (cmd === "delete_cash_receipt") {
    return undefined as T;
  }
  if (cmd === "list_cash_receipts") {
    return [] as T;
  }
  if (cmd === "list_materials") {
    return [] as T;
  }
  if (cmd === "save_material") {
    return undefined as T;
  }
  if (cmd === "delete_material") {
    return undefined as T;
  }
  if (cmd === "report_aging") {
    return [] as T;
  }
  if (cmd === "report_sales_analysis") {
    return [] as T;
  }
  if (cmd === "report_missing_invoices") {
    return [] as T;
  }
  if (cmd === "report_worker_wages") {
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
          empNo: "Jose Ramirez",
          empPrice: 0,
          commission: 65,
          status: "",
        },
      ],
    } as T;
  }
  if (cmd === "save_invoice") {
    return 2 as T;
  }
  if (cmd === "void_invoice") {
    return undefined as T;
  }
  throw new Error(`E2E mock: unhandled invoke "${cmd}"`);
}
