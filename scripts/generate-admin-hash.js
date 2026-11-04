#!/usr/bin/env node
'use strict';

const bcrypt = require('bcryptjs');
const { stdin, stdout, stderr } = process;

function promptHidden(label) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('Run this helper from an interactive terminal.'));
      return;
    }
    stdout.write(label);
    let value = '';
    const finish = result => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      resolve(result);
    };
    const onData = chunk => {
      for (const character of String(chunk)) {
        if (character === '\u0003') {
          stdin.removeListener('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= ' ' && character !== '\u007f') value += character;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function main() {
  const first = await promptHidden('Admin password (16-72 UTF-8 bytes): ');
  const second = await promptHidden('Confirm password: ');
  const bytes = Buffer.byteLength(first, 'utf8');
  if (first !== second) throw new Error('Passwords do not match.');
  if (bytes < 16 || bytes > 72) throw new Error('Password must be 16-72 UTF-8 bytes for bcrypt.');
  const hash = await bcrypt.hash(first, 12);
  stdout.write('\nSet this bcrypt hash as ADMIN_PASSWORD_HASH in Vercel only. Do not commit or share it.\n');
  stdout.write(hash + '\n');
}

main().catch(error => {
  stderr.write((error.message || 'Could not generate the password hash.') + '\n');
  process.exitCode = 1;
});
