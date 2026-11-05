/**
 * SWT commission engine (owner-confirmed 2026-11-05).
 * Prices exclude 4% fees.
 *
 * charged >= list  → commission = rate × charged
 * undersold        → base = list − 0.5 × (list − charged); commission = rate × base
 * no list          → base = charged; listVerified = false ("list not verified")
 */
export function computeCommission(rate, charged, listPrice) {
  if (charged === null || charged === undefined || Number.isNaN(Number(charged))) {
    return {
      listPrice: listPrice ?? null,
      charged: null,
      difference: null,
      commissionBase: null,
      commission: null,
      rate,
      status: "needs_review",
      listVerified: false,
      reason: "invalid charged",
    };
  }
  const ch = Number(charged);
  const listVerified =
    listPrice !== null && listPrice !== undefined && !Number.isNaN(Number(listPrice));

  if (!listVerified) {
    const base = ch;
    return {
      listPrice: null,
      charged: Math.round(ch * 100) / 100,
      difference: null,
      commissionBase: Math.round(base * 100) / 100,
      commission: Math.round(rate * base * 100) / 100,
      rate,
      status: "list_not_verified",
      listVerified: false,
      reason: "list not verified — used charged as base",
    };
  }

  const list = Math.round(Number(listPrice) * 100) / 100;
  const difference = Math.round((ch - list) * 100) / 100;
  let base;
  let status;
  if (ch >= list - 1e-9) {
    base = ch;
    status = Math.abs(difference) < 0.01 ? "ok" : "oversold";
  } else {
    const shortfall = list - ch;
    base = Math.round((list - 0.5 * shortfall) * 100) / 100;
    status = "undersold";
  }
  return {
    listPrice: list,
    charged: Math.round(ch * 100) / 100,
    difference,
    commissionBase: Math.round(base * 100) / 100,
    commission: Math.round(rate * base * 100) / 100,
    rate,
    status,
    listVerified: true,
    reason: null,
  };
}
