import { defineDemo } from 'video-demo/define';
import { networkIdle } from 'video-demo/ready';

/**
 * Filmed from a PINNED COPY of the submission repo at commit 0982971, served
 * by the app's own production server (node server.js), not a dev server.
 *
 * Why not the live URL: the Vercel project is still wired to the archive
 * repo, so production serves the OLD privacy wording and none of the 5 Nov
 * fixes. Filming it would put a false privacy claim into the submission
 * video. The copy is immutable for the run, so the footage cannot drift.
 */
export default defineDemo({
  name: 'siaga-id-reports',
  site: 'http://127.0.0.1:3100',

  clock: { timezone: 'Asia/Jakarta', locale: 'en-US' },

  // 1440x900 instead of 1080p: the sandbox compositor sustained only 18.9fps
  // at 1920x1080, which reads as judder. Fewer pixels per frame is the honest
  // fix; encoding 60fps over 19fps of real paints would flatter the number.
  stage: { width: 1440, height: 900 },

  themes: ['dark'],

  entries: {
    app: {
      path: '/reports',
      ready: networkIdle(),
    },
  },
});
