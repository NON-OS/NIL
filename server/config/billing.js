import envNumber from '../lib/envNumber.js';
import configWarning from '../lib/configWarning.js';
import envUsd from './envUsd.js';
import envAddress from './envAddress.js';
import envFlag from './envFlag.js';
import envPositiveDecimal from './envPositiveDecimal.js';
import envUrl from './envUrl.js';
import stakerTiers from './stakerTiers.js';
import invoiceSlot from './invoiceSlot.js';

// Nil Pro billing, NOX perks and the fair holder door. Prices are in USD. A workspace pays an
// invoice in USDC at face value or in NOX at a discount; every amount it asks for ends in a short
// suffix that tells its payment apart from anyone else's, so a transfer from any wallet or
// exchange can be matched to the right invoice.
const env = process.env;
const suffixDigits = envNumber('PLAN_SUFFIX_DIGITS', 4, { min: 2, max: 6 });
const invoiceKey = (env.PLAN_INVOICE_KEY ?? '').trim();
if (invoiceKey && invoiceKey.length < 16) configWarning('PLAN_INVOICE_KEY is shorter than 16 characters. Use a long random secret.');
const slot = invoiceSlot((env.PLAN_INVOICE_SLOT ?? '').trim(), suffixDigits);
if (slot && !invoiceKey) configWarning('PLAN_INVOICE_SLOT is set without PLAN_INVOICE_KEY, so anyone reading the treasury’s transfers can tell which payments came from the same workspace.');
if ((env.PLAN_PRICE ?? '').trim()) configWarning('PLAN_PRICE is no longer read. Nil Pro is priced in US dollars: set PLAN_PRICE_USD and PLAN_SEAT_USD.');
if ((env.NOX_CONFIRMATIONS ?? '').trim()) configWarning('NOX_CONFIRMATIONS is no longer read. A payment counts once its block is final; see NOX_FINALITY_DEPTH.');

const usdc = envAddress('PLAN_USDC', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 'Invoices can’t be paid in USDC until it’s set.');
const unpriced = 'NOX is priced with PLAN_NOX_USD alone.';

export default Object.freeze({
  priceUsd: envUsd('PLAN_PRICE_USD', '4', { positive: true }),
  seatUsd: envUsd('PLAN_SEAT_USD', '1'),
  usdc: usdc ? Object.freeze({ symbol: 'USDC', address: usdc, decimals: envNumber('PLAN_USDC_DECIMALS', 6, { min: suffixDigits, max: 77 }) }) : null,
  noxDiscount: envNumber('PLAN_NOX_DISCOUNT', 50, { max: 90 }),
  stakerTiers: stakerTiers((env.PLAN_STAKER_TIERS ?? '10000:10,100000:25').trim()),
  invoiceHours: envNumber('PLAN_INVOICE_HOURS', 24, { min: 1, max: 24 * 14 }),
  lateDays: envNumber('PLAN_LATE_DAYS', 7, { max: 90 }),
  invoicesPerDay: envNumber('PLAN_INVOICES_PER_DAY', 10, { min: 1 }),
  suffixDigits,
  // exchanges and many wallets refuse amounts with more decimal places than this
  amountDecimals: envNumber('PLAN_AMOUNT_DECIMALS', 8, { min: suffixDigits, max: 18 }),
  slot,
  invoiceKey: invoiceKey || null,
  logBlocks: envNumber('PLAN_LOG_BLOCKS', 2000, { min: 10 }),
  // the reconciliation: how often, how many recent blocks it reads again, and for how long it
  // keeps looking for payments that were given up on
  reconcileMinutes: envNumber('PLAN_RECONCILE_MINUTES', 60, { min: 5 }),
  reconcileBlocks: envNumber('PLAN_RECONCILE_BLOCKS', 7200, { min: 100 }),
  reconcileDays: envNumber('PLAN_RECONCILE_DAYS', 30, { min: 1, max: 365 }),
  treasuryName: (env.PLAN_TREASURY_NAME ?? '').trim().slice(0, 60) || 'the treasury',
  remindDays: Object.freeze([...new Set((env.PLAN_REMIND_DAYS || '7,1').split(',').map((d) => Number(d.trim())).filter((d) => Number.isInteger(d) && d > 0))].sort((a, b) => b - a)),
  proForZsp: envFlag('PRO_FOR_ZSP', true),
  perkCheckHours: envNumber('PLAN_PERK_CHECK_HOURS', 6, { min: 1 }),
  burnShare: envNumber('BURN_SHARE', 0, { max: 100 }),
  burnReportUrl: envUrl('BURN_REPORT_URL'),
  oracle: Object.freeze({
    pool: envAddress('PLAN_NOX_POOL', null, unpriced),
    weth: envAddress('PLAN_WETH', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', unpriced),
    ethUsdFeed: envAddress('PLAN_ETH_USD_FEED', '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', unpriced),
    twapMinutes: envNumber('PLAN_TWAP_MINUTES', 30, { min: 5, max: 24 * 60 }),
    // the window's stretches, whose median average is the price (pairTwap.js)
    twapParts: envNumber('PLAN_TWAP_PARTS', 6, { min: 1, max: 60 }),
    feedMaxAgeMinutes: envNumber('PLAN_FEED_MAX_AGE_MINUTES', 120, { min: 1 }),
    // USD per whole NOX, as decimal text; the oracle's answer must sit between the bounds
    minUsd: envPositiveDecimal('PLAN_NOX_USD_MIN', '0.000001'),
    maxUsd: envPositiveDecimal('PLAN_NOX_USD_MAX', '1000'),
    manualUsd: envPositiveDecimal('PLAN_NOX_USD', null),
  }),
});
