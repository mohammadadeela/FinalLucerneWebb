// Reads the staff accounts that are bootstrapped from environment variables.
//
// Admin is a single account:  ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME
//
// Employees can be one or more. The first one keeps the original names and
// every additional one gets a number suffix:
//
//   EMPLOYEE_EMAIL  / EMPLOYEE_PASSWORD  / EMPLOYEE_NAME     (employee 1)
//   EMPLOYEE2_EMAIL / EMPLOYEE2_PASSWORD / EMPLOYEE2_NAME    (employee 2)
//   EMPLOYEE3_EMAIL / EMPLOYEE3_PASSWORD / EMPLOYEE3_NAME    (employee 3)
//   ...
//
// EMPLOYEE1_* is also accepted as an alias for the un-numbered one. A slot is
// only used when both its EMAIL and PASSWORD are set; NAME is optional.

export const MAX_ENV_EMPLOYEES = 20;

export interface EnvEmployee {
  /** Which env slot this came from, e.g. "EMPLOYEE" or "EMPLOYEE2". */
  key: string;
  email: string;
  password: string;
  name?: string;
}

function readSlot(prefix: string): EnvEmployee | null {
  const email = process.env[`${prefix}_EMAIL`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) return null;
  return {
    key: prefix,
    email,
    password,
    name: process.env[`${prefix}_NAME`]?.trim() || undefined,
  };
}

/** All employee accounts configured in the env, in slot order. */
export function getEnvEmployees(): EnvEmployee[] {
  const seen = new Set<string>();
  const employees: EnvEmployee[] = [];

  // Slot 1 can be written as EMPLOYEE_* (original) or EMPLOYEE1_*.
  const first = readSlot("EMPLOYEE") ?? readSlot("EMPLOYEE1");
  if (first) {
    employees.push(first);
    seen.add(first.email.toLowerCase());
  }

  for (let i = 2; i <= MAX_ENV_EMPLOYEES; i++) {
    const emp = readSlot(`EMPLOYEE${i}`);
    if (!emp) continue;
    if (seen.has(emp.email.toLowerCase())) {
      console.warn(`[seed] ${emp.key}_EMAIL duplicates another employee slot — skipping.`);
      continue;
    }
    seen.add(emp.email.toLowerCase());
    employees.push(emp);
  }

  return employees;
}

/** Lower-cased emails of every env-configured staff account (admin + employees). */
export function getEnvStaffEmails(): string[] {
  const emails = [process.env.ADMIN_EMAIL, ...getEnvEmployees().map((e) => e.email)];
  return emails.map((e) => (e || "").trim().toLowerCase()).filter(Boolean);
}
