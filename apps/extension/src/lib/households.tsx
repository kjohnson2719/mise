import { switchHousehold, type Connection } from "./merran"

/**
 * Which household the extension works with: just its name with one, a
 * switch between them with more. Each has a key of its own.
 */
export function HouseholdSwitch({
  current,
  all,
}: {
  current: Connection
  all: Connection[]
}) {
  if (all.length < 2) {
    return <span className="muted small">{current.household}</span>
  }
  // Households on different Merrans say which.
  const servers = new Set(all.map((one) => one.origin)).size
  return (
    <select
      value={current.keyId}
      onChange={(event) => void switchHousehold(event.target.value)}
      aria-label="Household"
    >
      {all.map((one) => (
        <option key={one.keyId} value={one.keyId}>
          {servers > 1
            ? `${one.household} (${new URL(one.origin).host})`
            : one.household}
        </option>
      ))}
    </select>
  )
}
