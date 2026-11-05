/**
 * SWT commission engine (owner policy).
 * Prices exclude the 4% fee. Commission is never negative.
 *
 * charged >= list              → rate × charged
 * undersold by less than 10%   → rate × list − 0.5 × (list − charged)
 * charged <= 90% of list       → $0 (no manager approval in this demo)
 * no list                      → rate × charged, list not verified
 *
 * $1,000 list at 5%: sold $1,100 → $55; sold $950 → $25; sold $900 → $0.
 */
const cents = (n) => Math.round(Number(n) * 100);
const dollars = (c) => c / 100;

function clampCents(rawCents) {
  return Math.max(0, Math.round(rawCents));
}

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

  const chargedCents = cents(charged);
  const ch = dollars(chargedCents);
  const listVerified =
    listPrice !== null && listPrice !== undefined && !Number.isNaN(Number(listPrice));

  if (!listVerified) {
    return {
      listPrice: null,
      charged: ch,
      difference: null,
      commissionBase: ch,
      commission: dollars(clampCents(rate * chargedCents)),
      rate,
      status: "list_not_verified",
      listVerified: false,
      reason: "list not verified — used charged as base",
    };
  }

  const listCents = cents(listPrice);
  const list = dollars(listCents);
  const difference = dollars(chargedCents - listCents);
  const shared = {
    listPrice: list,
    charged: ch,
    difference,
    rate,
    listVerified: true,
  };

  if (chargedCents >= listCents) {
    return {
      ...shared,
      commissionBase: ch,
      commission: dollars(clampCents(rate * chargedCents)),
      status: Math.abs(difference) < 0.01 ? "ok" : "oversold",
      reason: null,
    };
  }

  // charged <= 90% of list. Integer compare avoids binary float on the boundary.
  if (chargedCents * 10 <= listCents * 9) {
    return {
      ...shared,
      commissionBase: 0,
      commission: 0,
      status: "below_floor",
      reason: "charged at or below 90% of list",
    };
  }

  const shortfallCents = listCents - chargedCents;
  return {
    ...shared,
    commissionBase: null,
    commission: dollars(clampCents(rate * listCents - 0.5 * shortfallCents)),
    status: "undersold",
    reason: null,
  };
}
