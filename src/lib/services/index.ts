export { createExpense, listExpenses } from "./expenses";
export type { CreateExpenseInput, ListExpensesFilter } from "./expenses";

export { listCategories } from "./categories";

export { getExpenseStats } from "./stats";
export type { GetStatsFilter } from "./stats";

export { processReceipt } from "./ocr";
export type { ProcessReceiptInput, OcrResult } from "./ocr";

export { parseCFDI, CFDIParseError } from "./cfdi-parser";
export type { ParsedCFDI } from "./cfdi-parser";

export {
  createIncome,
  listIncome,
  getIncomeById,
  deleteIncome,
  checkDuplicateUuid,
  getIncomeSummary,
} from "./income";
export type { CreateIncomeInput, ListIncomeFilter, IncomeSummary } from "./income";

export { createAccount, deleteAccount, listAccounts, updateAccount } from "./accounts";
export type { AccountInput } from "./accounts";

export { createCreditCard, deleteCreditCard, listCreditCards, updateCreditCard } from "./credit-cards";
export type { CreditCardInput } from "./credit-cards";

export { getHouseholdSummary } from "./household-summary";
export type { HouseholdSummaryFilter } from "./household-summary";

export {
  createInstallmentPlan,
  deleteInstallmentPlan,
  getInstallmentCommitmentSummary,
  listInstallmentPlans,
  updateInstallmentPlan,
} from "./installment-plans";
export type { InstallmentPlanInput } from "./installment-plans";

export {
  createRecurringPayment,
  deleteRecurringPayment,
  getRecurringPaymentCommitmentSummary,
  listRecurringPaymentOccurrences,
  listRecurringPayments,
  markRecurringPaymentOccurrencePaid,
  updateRecurringPayment,
} from "./recurring-payments";
export type { PayRecurringPaymentOccurrenceInput, RecurringPaymentInput } from "./recurring-payments";

export {
  createReceiptDraft,
  deleteReceiptDraft,
  findCategoryIdByName,
  findTelegramReceiptDraft,
  listReceiptDrafts,
  saveReceiptDraft,
  updateReceiptDraft,
} from "./receipt-drafts";
export type { ListReceiptDraftsFilter, ReceiptDraftInput } from "./receipt-drafts";

export {
  createTelegramPairingCode,
  getTelegramConnection,
  handleTelegramUpdate,
  revokeTelegramConnection,
} from "./telegram";

export {
  buildReceiptFingerprint,
  duplicateReviewPatch,
  findReceiptDuplicateCandidate,
} from "./receipt-duplicates";
export type { ReceiptDuplicateCandidate, ReceiptFingerprintInput } from "./receipt-duplicates";

export { getFamilyPlanSummary, updateFamilyPlan, validateFamilyPlanPeriod } from "./family-plan";
export type { FamilyPlanPeriod, FamilyPlanUpdateInput } from "./family-plan";
