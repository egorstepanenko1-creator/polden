/** Статусы заявки B2B (лид). ACTIVE = привязан к CompanyAccount после конвертации. */
export const CORPORATE_LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUOTED', 'PILOT', 'ACTIVE', 'LOST'];

/** Статусы карточки компании. */
export const COMPANY_ACCOUNT_STATUSES = ['NEW', 'ACTIVE', 'PAUSED', 'LOST'];

const LEAD_SET = new Set(CORPORATE_LEAD_STATUSES);
const COMPANY_SET = new Set(COMPANY_ACCOUNT_STATUSES);

export function isCorporateLeadStatus(s) {
  return LEAD_SET.has(String(s || '').trim());
}

export function isCompanyAccountStatus(s) {
  return COMPANY_SET.has(String(s || '').trim());
}
