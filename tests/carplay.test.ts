/**
 * CarPlay: the screen the car shows (src/carplay/screen.ts) and the config plugin that adds
 * the CarPlay scene to the iPhone app (plugins/withCarPlay.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import appJson from '../app.json';
import { carScreen, names, parseAction, type CarState, type KidPickup } from '../src/carplay/screen';
import { addCarPlayDelegate, addCarPlayScene, ENTITLEMENT, setEntitlement, useSimulatorEntitlements } from '../plugins/withCarPlay';
import { addSceneManifest, transformAppDelegate } from '../plugins/withSceneLifecycle';

const emma = { id: 's1', firstName: 'Emma', lastName: 'Ruiz', number: '12' };
const noah = { id: 's2', firstName: 'Noah', lastName: 'Ruiz', number: null };
const pickup = (studentId: string, status: KidPickup['status'], more: Partial<KidPickup> = {}): KidPickup => ({
  id: `p-${studentId}`, studentId, status, arrivedAt: '2026-10-16T20:02:00Z', pickedUpAt: null, ...more,
});
const parent = (pickups: KidPickup[], kids = [emma, noah], line: 'open' | 'early' | 'closed' = 'open'): CarState =>
  ({ kind: 'parent', kids, pickups, hours: '2:45–3:30 PM', line });

test('before checking in: "I\'m here" checks everyone in, each child can go alone, rows show pickup numbers', () => {
  const { sections: [top, kids] } = carScreen(parent([]));
  assert.equal(top.header, 'Pickup 2:45–3:30 PM');
  assert.deepEqual(top.items[0], { id: 'checkin:s1,s2', text: "I'm here", detail: 'Check in Emma and Noah', symbol: 'car.fill' });
  assert.equal(kids.header, 'Your children');
  assert.deepEqual(kids.items.map((i) => i.id), ['checkin:s1', 'checkin:s2']);
  assert.deepEqual(kids.items.map((i) => i.text), ['#12  Emma Ruiz', 'Noah Ruiz'], 'like Android Auto');
});

test('when the line is closed there is nothing to tap', () => {
  const { sections: [top, kids] } = carScreen(parent([], [emma, noah], 'closed'));
  assert.deepEqual([top.items[0].text, top.items[0].detail], ['The car line is closed', "It's open on school days, 2:45–3:30 PM."]);
  assert.ok([...top.items, ...kids.items].every((i) => i.id === ''));
});

test('checked in: the big row says so, and cancelling a child asks first', () => {
  const { sections: [top, kids] } = carScreen(parent([pickup('s1', 'waiting'), pickup('s2', 'waiting')]));
  assert.equal(top.items[0].text, "You're in the car line");
  assert.equal(top.items[0].id, '', 'information only');
  assert.equal(kids.items[0].id, 'cancel:p-s1');
  assert.match(kids.items[0].detail!, /^In line since .+\. Tap to cancel\.$/);
  assert.deepEqual(kids.items[0].confirm, { title: "Cancel Emma's check-in?", ok: 'Cancel Check-In', cancel: 'Keep' });
});

test('a child still to collect keeps the big row; picked-up children and cancelled check-ins are handled', () => {
  const { sections: [top, kids] } = carScreen(parent([
    pickup('s1', 'cancelled', { id: 'old' }), pickup('s1', 'picked_up', { pickedUpAt: '2026-10-16T20:12:00Z' }),
  ]));
  assert.equal(top.items[0].id, 'checkin:s2', 'only Noah is left');
  assert.match(kids.items[0].detail!, /^Picked up at /);
  assert.equal(kids.items[0].id, '');
  const done = carScreen(parent([pickup('s1', 'picked_up'), pickup('s2', 'picked_up')]));
  assert.equal(done.sections[0].items[0].text, 'Everyone is picked up');
});

test('one child: no "Your children" header, but their row stays for status and Cancel', () => {
  const { sections } = carScreen(parent([], [emma]));
  assert.equal(sections[0].items[0].detail, 'Check in Emma');
  assert.equal(sections[1].header, undefined);
  assert.equal(sections[1].items.length, 1);
});

test('signed out, waiting for approval, no children, offline and errors each get one clear row', () => {
  const only = (s: CarState) => { const { sections } = carScreen(s); assert.equal(sections.length, 1); return sections[0].items[0]; };
  assert.equal(only({ kind: 'signed-out' }).text, 'Sign in on your iPhone');
  assert.equal(only({ kind: 'pending' }).text, 'Waiting for approval');
  assert.equal(only(parent([], [])).text, 'No children linked yet');
  assert.equal(only({ kind: 'offline' }).text, 'Car line needs the school server');
  assert.equal(only({ kind: 'error', message: 'Network down' }).detail, 'Network down');
  for (const s of [{ kind: 'signed-out' }, { kind: 'pending' }] as CarState[]) assert.equal(only(s).id, '', 'nothing to tap');
});

test('taps turn into car line actions', () => {
  assert.deepEqual(parseAction('checkin:s1,s2'), { checkIn: ['s1', 's2'] });
  assert.deepEqual(parseAction('cancel:p-1'), { cancel: 'p-1' });
  assert.equal(parseAction(''), null);
  assert.equal(parseAction('checkin:'), null);
  assert.equal(names(['Emma', 'Noah', 'Ava']), 'Emma, Noah and Ava');
});

test('app.json applies the CarPlay plugin', () => {
  assert.ok(appJson.expo.plugins.includes('./plugins/withCarPlay'));
});

test('AppDelegate gets the CarPlay scene delegate, which starts React Native without the phone window', () => {
  const template = readFileSync(join(__dirname, 'fixtures/AppDelegate.sdk57.swift'), 'utf8');
  const out = addCarPlayDelegate(transformAppDelegate(template));
  assert.match(out, /^internal import Expo\ninternal import KHCarPlay$/m);
  assert.match(out, /class CarPlaySceneDelegate: CarPlaySceneDelegateBase \{/);
  assert.match(out, /rootViewFactory\.view\(withModuleName: "carplay"\)/);
  assert.equal(addCarPlayDelegate(out), out, 'safe to run twice');
  // The scene plugin still recognizes the template whichever runs first.
  assert.equal(transformAppDelegate(addCarPlayDelegate(template)).match(/class CarPlaySceneDelegate/g)?.length, 1);
});

test('Info.plist keeps both scenes, whichever plugin runs first', () => {
  for (const plist of [addSceneManifest(addCarPlayScene({})), addCarPlayScene(addSceneManifest({}))] as any[]) {
    const scenes = plist.UIApplicationSceneManifest.UISceneConfigurations;
    assert.equal(scenes.UIWindowSceneSessionRoleApplication[0].UISceneDelegateClassName, '$(PRODUCT_MODULE_NAME).SceneDelegate');
    assert.deepEqual(scenes.CPTemplateApplicationSceneSessionRoleApplication[0], {
      UISceneClassName: 'CPTemplateApplicationScene',
      UISceneConfigurationName: 'CarPlay',
      UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).CarPlaySceneDelegate',
    });
  }
});

test('the driving task entitlement: simulator builds always, iPhone builds only once Apple grants it', () => {
  assert.equal(ENTITLEMENT, 'com.apple.developer.carplay-driving-task');
  assert.deepEqual(setEntitlement({ 'aps-environment': 'development' }, false), { 'aps-environment': 'development' });
  assert.equal(setEntitlement({}, true)[ENTITLEMENT], true);
  assert.equal(setEntitlement({ [ENTITLEMENT]: true }, false)[ENTITLEMENT], undefined);

  const settings = { app: { buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: 'com.khroyals.app', INFOPLIST_FILE: 'KHRoyals/Info.plist' } }, project: { buildSettings: {} } };
  useSimulatorEntitlements({ pbxXCBuildConfigurationSection: () => settings });
  assert.equal((settings.app.buildSettings as any)['"CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]"'], '"../plugins/carplay/Simulator.entitlements"');
  assert.deepEqual(settings.project.buildSettings, {}, 'only the app target');

  const simulator = readFileSync(join(__dirname, '../plugins/carplay/Simulator.entitlements'), 'utf8');
  assert.match(simulator, /<key>com\.apple\.developer\.carplay-driving-task<\/key>\s*<true\/>/);
  assert.match(simulator, /<key>aps-environment<\/key>/, 'push still works in the simulator');
});
