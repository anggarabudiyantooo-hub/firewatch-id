import { scene } from 'video-demo/scene';
import { summaryCard, summaryNarrative, methodAccordion } from '../ui';

/**
 * Filmed at commit 0982971. The capture dialog is deliberately not driven
 * here: under screencast it failed twice to produce a PNG, and a scene that
 * cannot be filmed reliably is worse than a shorter honest one. The consent
 * flow is covered by scripts/manual-map-capture.js (22/22) instead.
 */
scene(
  'reports',
  {
    title: 'A report that shows its work',
    blurb: 'The summary card sits above the tools, reads only the archive, and says unavailable instead of inventing numbers.',
  },
  async ({ actor, page, shot }) => {
    await page.waitForSelector('.report-summary', { timeout: 30000 });
    await page.click('#langEn');
    await page.waitForFunction(
      () => /This issue at a glance/.test(document.querySelector('.report-sum-title')?.textContent || ''),
      null,
      { timeout: 20000 }
    );
    await actor.settle();
    await actor.beat(500);

    await actor.spotlight(
      summaryNarrative(page),
      'Every issue opens with a summary written by code, from the archived file itself.',
      { scale: 1.4 }
    );
    await shot('summary');

    await actor.spotlight(
      summaryCard(page).locator('.report-sum-tile').nth(3),
      'Air quality is not stored in this archive, so the card says unavailable rather than inventing a number.',
      { scale: 1.7 }
    );
    await shot('unavailable');

    await actor.spotlight(
      summaryCard(page).locator('.report-sum-tile').nth(4),
      'Five of five feeds were available, and a failed feed would read unavailable, never zero.',
      { scale: 1.7 }
    );

    await actor.click(methodAccordion(page));
    await actor.spotlight(
      summaryCard(page).locator('.report-sum-method'),
      'The method stays one click away, folded rather than deleted.',
      { scale: 1.5 }
    );
    await shot('method');
    await actor.click(methodAccordion(page));
    await actor.unfocus();

    await page.locator('#tangkapan-peta').scrollIntoViewIfNeeded();
    await actor.settle();
    await actor.say('Below it, the map capture keeps its legend, attribution and timestamp inside the image itself.');
    await shot('capture-panel');

    await page.goto('/reports?demo=1', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#reportDemoBadge', { timeout: 30000 });
    await actor.settle();
    await actor.spotlight(
      page.locator('#reportDemoBadge'),
      'And a recording mode labels itself as stored data, so a fixture is never mistaken for a live feed.',
      { scale: 1.8 }
    );
    await shot('demo');
    await actor.unfocus();
  }
);
