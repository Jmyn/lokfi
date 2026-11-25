import type { Filters } from '../pages/transactions/filterTypes'
import type { DbTransaction } from './db/db'

export const bankSpendingExclusionLabels = {
  transfer: 'Transfers and card repayments',
  investment: 'Investments and brokerage funding',
  category: 'Other excluded categories',
}

export type BankSpendingExclusion = keyof typeof bankSpendingExclusionLabels

const transferCategory =
  /^(?:transfers?|internal transfers?|(?:credit )?card (?:payments?|repayments?|(?:bill )?settlements?))$/i
const investmentCategory = /^(?:investments?|brokerage (?:funding|deposits?))$/i
const cardSettlement =
  /\b(?:credit card (?:bill )?(?:payment|repayment|settlement)|(?:payment|repayment|settlement) (?:of|to|for) (?:a |my |the )?(?:credit card|visa card|mastercard (?:card|bill))|card (?:bill (?:payment|settlement)|repayment)|transfer between own accounts)\b/i
const brokerFunding =
  /\b(?:(?:transfer|paynow|deposit|top[ -]?up|funding)\b.*\b(?:tiger brokers|moomoo|interactive brokers|ibkr|saxo markets|brokerage account)|brokerage (?:deposit|funding))\b/i
const feeDescription = /\b(?:fees?|commissions?|charges?|levies|levy)\b/i

export function getBankSpendingExclusion(
  transaction: DbTransaction,
  categoryName: string | undefined,
  filters: Pick<Filters, 'excludeTransfers' | 'excludeInvestments' | 'excludedCategoryIds'>
): BankSpendingExclusion | undefined {
  const categoryId = transaction.manualCategory ?? transaction.category ?? '__uncategorised__'
  const description = transaction.description.replace(/\s+/g, ' ')
  const name = categoryName?.trim() ?? ''
  const inferFromDescription = !transaction.manualCategory && !feeDescription.test(description)

  if (
    filters.excludeInvestments &&
    (investmentCategory.test(name) || (inferFromDescription && brokerFunding.test(description)))
  ) {
    return 'investment'
  }
  if (
    filters.excludeTransfers &&
    (categoryId === 'cat_transfer' ||
      transferCategory.test(name) ||
      (inferFromDescription && cardSettlement.test(description)))
  ) {
    return 'transfer'
  }
  if (filters.excludedCategoryIds?.includes(categoryId)) return 'category'
}
