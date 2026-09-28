import { useBudget } from '../hooks/useBudget'

const usd = (amount: number) => amount.toFixed(2)

/**
 * Spending is shown to 9 decimals so even a single cheap request (fractions of a cent) is visible
 * while tracking; the cap stays at cents.
 */
const SPENT_DECIMALS = 9
const spentUsd = (amount: number) => amount.toFixed(SPENT_DECIMALS)

/** "$0.000120000/5.00" in the window header: what the AI helpers have spent against the app's cap. */
export function BudgetIndicator() {
  const budget = useBudget()

  if (!budget) {
    return (
      <span className="budget" title="Loading the AI budget…">
        $—/—
      </span>
    )
  }

  const used = budget.limitUsd > 0 ? budget.spentUsd / budget.limitUsd : 1
  const level = budget.exhausted ? 'is-exhausted' : used >= 0.8 ? 'is-low' : ''

  return (
    <span
      className={`budget ${level}`.trim()}
      title={
        budget.exhausted
          ? 'The AI budget is used up, so suggestions are paused.'
          : `AI budget: $${spentUsd(budget.remainingUsd)} left of $${usd(budget.limitUsd)}`
      }
      aria-label={`AI budget used: ${spentUsd(budget.spentUsd)} of ${usd(budget.limitUsd)} dollars`}
    >
      <span className="budget__bar" aria-hidden="true">
        <span className="budget__fill" style={{ width: `${Math.min(used, 1) * 100}%` }} />
      </span>
      ${spentUsd(budget.spentUsd)}/{usd(budget.limitUsd)}
    </span>
  )
}
