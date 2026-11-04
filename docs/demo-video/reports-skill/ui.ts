import type { Locator, Page } from '@playwright/test';

/** Locators proven by scripts/manual-report-summary.js and manual-map-capture.js. */
export const summaryCard = (page: Page): Locator => page.locator('.report-summary');
export const summaryNarrative = (page: Page): Locator => page.locator('.report-sum-narrative');
export const methodAccordion = (page: Page): Locator => page.locator('.report-sum-method summary');
export const captureButton = (page: Page): Locator => page.locator('#reportMapCaptureBtn');
export const consentBox = (page: Page): Locator => page.locator('#mapCaptureConsent');
export const consentLabel = (page: Page): Locator => page.locator('#mapCaptureConsentLabel');
export const narrateButton = (page: Page): Locator => page.locator('#mapCaptureNarrate');
export const captureImage = (page: Page): Locator => page.locator('#mapCaptureImg');
