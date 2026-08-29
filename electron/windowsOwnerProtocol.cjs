'use strict';

const PARENT_STARTUP_MESSAGE_LIMIT_CHARACTERS = 128;

function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function parseWindowsOwnerFrame(line, { nonce, ownerPid, pipeState }) {
  let frame;
  try {
    frame = JSON.parse(line);
  } catch (error) {
    throw new Error('Windows Job owner returned malformed JSON', { cause: error });
  }

  if (
    ['awaiting-owner', 'awaiting-target'].includes(pipeState) &&
    hasExactKeys(frame, ['type', 'nonce', 'message']) &&
    frame.type === 'startup-error' &&
    frame.nonce === nonce &&
    typeof frame.message === 'string' &&
    frame.message.length > 0 &&
    frame.message.length <= 512
  ) {
    return frame;
  }

  if (pipeState === 'awaiting-owner') {
    if (
      !hasExactKeys(frame, ['type', 'nonce', 'ownerPid']) ||
      frame.type !== 'owner-ready' ||
      frame.nonce !== nonce ||
      frame.ownerPid !== ownerPid
    ) {
      throw new Error('Windows Job owner returned invalid readiness proof');
    }
    return frame;
  }

  if (
    pipeState !== 'awaiting-target' ||
    !hasExactKeys(frame, ['type', 'nonce', 'code', 'signal']) ||
    frame.type !== 'target-result' ||
    frame.nonce !== nonce ||
    !Number.isSafeInteger(frame.code) ||
    frame.signal !== null
  ) {
    throw new Error('Windows Job owner returned an invalid or out-of-order result');
  }
  return frame;
}

module.exports = { PARENT_STARTUP_MESSAGE_LIMIT_CHARACTERS, parseWindowsOwnerFrame };
