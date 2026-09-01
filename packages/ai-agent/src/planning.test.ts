import { describe, expect, it } from 'vitest';

import { PLAN_ACTION_THRESHOLD, decidePlanning, isQuestionOnly, needsPlan } from './planning';

/**
 * Whether a goal gets a plan.
 *
 * The reported defect: "call this number 0000" produced a task list. One tool call, presented as a project —
 * and the cost is a model round trip before anything happens, on exactly the goals that should feel instant.
 *
 * The cases below are the ones that decide whether this is right. The simple ones are quoted close to how the
 * user phrased them, because paraphrasing a test case into something tidier is how a heuristic passes its
 * tests and still fails in the app.
 */

describe('goals that must not be planned', () => {
  it('does not plan a phone call', () => {
    // The reported case, verbatim in shape.
    expect(needsPlan('call this number 0000')).toBe(false);
    expect(needsPlan('call 0000')).toBe(false);
    expect(needsPlan('please call this number 07700900123')).toBe(false);
  });

  it('does not plan a screenshot and a description of it', () => {
    // The second reported case, and the one that broke an earlier version of this: a bare "and" was treated
    // as a sequence signal, but telling the user about a screenshot is the *reply*, not a second step.
    expect(needsPlan('take a screenshot and tell me about it')).toBe(false);
    expect(needsPlan('screenshot this screen and describe what you see')).toBe(false);
  });

  it('does not plan opening one app', () => {
    expect(needsPlan('open WhatsApp')).toBe(false);
    expect(needsPlan('open the clock app')).toBe(false);
  });

  it('does not plan a question about the screen', () => {
    expect(needsPlan('what is on the screen')).toBe(false);
    expect(needsPlan('which app am I in')).toBe(false);
    expect(needsPlan('read me the notification')).toBe(false);
  });

  it('does not plan a single device setting change', () => {
    expect(needsPlan('turn the brightness down')).toBe(false);
    expect(needsPlan('put the phone on silent')).toBe(false);
  });

  it('does not plan an empty or trivial goal', () => {
    expect(needsPlan('')).toBe(false);
    expect(needsPlan('   ')).toBe(false);
    expect(needsPlan('hi')).toBe(false);
  });

  it('reports why, so a trace can explain the decision', () => {
    expect(decidePlanning('call 0000').reason).toContain('single action');
    expect(decidePlanning('what is on screen').reason).toMatch(/question|small step/);
  });
});

describe('goals that must be planned', () => {
  it('plans a message to a person through an app', () => {
    // Several steps on a real phone: open the app, find the person, type, send. The goal says so by naming an
    // app, a recipient and a payload.
    expect(needsPlan("send Robert a WhatsApp message that I'll be late tomorrow")).toBe(true);
  });

  it('plans an explicit sequence', () => {
    expect(needsPlan('open settings and then turn on aeroplane mode')).toBe(true);
    expect(needsPlan('take a screenshot, then send it to Robert')).toBe(true);
  });

  it('plans a conditional', () => {
    expect(needsPlan('if there is an unread message from Robert, reply to it')).toBe(true);
    expect(needsPlan('reply to Robert unless he already answered')).toBe(true);
  });

  it('plans work over a set', () => {
    expect(needsPlan('delete every photo from yesterday')).toBe(true);
    expect(needsPlan('go through my notifications one by one')).toBe(true);
  });

  it('plans two sentences', () => {
    expect(needsPlan('Open WhatsApp. Send Robert a message.')).toBe(true);
  });

  it('plans a long instruction regardless of its verbs', () => {
    // Nobody writes twenty-five words to ask for one tap.
    const long =
      'I want you to look at my calendar for the coming week and work out which ' +
      'afternoons are completely free of meetings so I can decide about the trip';

    expect(needsPlan(long)).toBe(true);
  });

  it('counts actions, and two is enough', () => {
    const decision = decidePlanning('open WhatsApp and send a message');

    expect(decision.actionCount).toBeGreaterThanOrEqual(PLAN_ACTION_THRESHOLD);
    expect(decision.needsPlan).toBe(true);
  });
});

describe('word matching', () => {
  it('does not fire on a word inside another word', () => {
    // "and" inside "android", "set" inside "settings" — the trap that makes a naive substring check plan
    // everything.
    expect(needsPlan('open android settings')).toBe(false);
  });

  it('is case-insensitive, since a goal is typed by a person', () => {
    expect(needsPlan('CALL 0000')).toBe(false);
    expect(needsPlan('Open Settings AND THEN turn on wifi')).toBe(true);
  });
});

describe('question-only goals', () => {
  it('recognises a request for an answer rather than an action', () => {
    expect(isQuestionOnly('what is on the screen')).toBe(true);
    expect(isQuestionOnly('tell me which app is open')).toBe(true);
  });

  it('does not call an action a question just because it will be reported', () => {
    // A screenshot is still work, even though the user wants to be told about it afterwards.
    expect(isQuestionOnly('take a screenshot and tell me about it')).toBe(false);
  });
});
