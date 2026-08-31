import { type ToolName } from '@mobile-automation/tool-sdk';

import {
  adjustVolume,
  clickAt,
  click,
  controlMedia,
  createAlarm,
  endCall,
  findContacts,
  findElement,
  getContacts,
  getCurrentScreen,
  getSystemSetting,
  getUiTree,
  launchIntent,
  listApps,
  longPress,
  openApp,
  openAppByName,
  placeCall,
  pressBack,
  pressHome,
  readClipboard,
  readSms,
  sendNotification,
  sendSms,
  setRingerMode,
  setSystemSetting,
  swipe,
  takeScreenshot,
  typeText,
  waitForElement,
  writeClipboard,
} from './automation';
import {
  type MediaCommand,
  type RingerMode,
  type Selector,
  type SwipeDirection,
  type VolumeDirection,
} from './types';

/**
 * Dispatching a tool call by name.
 *
 * The agent and the MCP server both receive a tool *name* and an argument object -
 * from a model and from an external client respectively - and both need to reach the
 * same device function. Without this, each would grow its own switch, and the two would
 * eventually disagree about what `swipe` means.
 *
 * Arguments arrive already validated against that tool's Zod schema, so this reads them
 * without re-checking. The validation gate is in `tool-sdk`, deliberately upstream of
 * here: a call that failed validation must never reach a device function at all.
 */

type ToolArguments = Readonly<Record<string, unknown>>;

/**
 * Runs a tool by name.
 *
 * Throws for an unknown name rather than returning undefined. A silently ignored tool
 * call would leave the agent believing it had acted, and it would then reason about a
 * screen that never changed.
 */
export const invokeTool = async (tool: string, args: ToolArguments): Promise<unknown> => {
  switch (tool as ToolName) {
    // --- acting on the screen -------------------------------------------

    case 'click':
      return click(args.selector as Selector);

    case 'longPress':
      return longPress(args.selector as Selector, args.durationMs as number | undefined);

    case 'swipe':
      return swipe(args.direction as SwipeDirection, args.distanceFraction as number | undefined);

    case 'typeText':
      return typeText(args.selector as Selector, args.text as string);

    case 'pressBack':
      return pressBack();

    case 'pressHome':
      return pressHome();

    // --- reading the screen ---------------------------------------------

    case 'findElement':
      return findElement(args.selector as Selector);

    case 'waitForElement':
      return waitForElement(args.selector as Selector, args.timeoutMs as number | undefined);

    case 'getUiTree':
      // Defaults to compact: the caller is almost always assembling model context,
      // where the omitted fields cost tokens and carry nothing.
      return getUiTree((args.compact as boolean | undefined) ?? true);

    case 'takeScreenshot':
      return takeScreenshot();

    case 'getCurrentScreen':
      return getCurrentScreen();

    // --- apps ------------------------------------------------------------

    case 'openApp':
      return openApp(args.packageName as string);

    case 'openAppByName':
      return openAppByName(args.name as string);

    case 'listApps':
      return listApps(args.includeSystem as boolean | undefined);

    // --- device data -----------------------------------------------------

    case 'getContacts':
      return getContacts(args.limit as number | undefined);

    case 'findContacts':
      return findContacts(args.query as string);

    case 'createAlarm':
      return createAlarm({
        hour: args.hour as number,
        minute: args.minute as number,
        label: args.label as string | undefined,
        repeatDays: args.repeatDays as number[] | undefined,
        // Set silently rather than opening the clock app pre-filled. An agent that
        // handed the user a half-filled form would have failed at the task it was asked
        // to do, and the tool is not offered a choice about it.
        skipUi: true,
      });

    case 'readClipboard':
      return readClipboard();

    case 'writeClipboard':
      return writeClipboard(args.text as string);

    case 'sendNotification':
      return sendNotification(args.title as string, args.body as string);

    case 'launchIntent':
      return launchIntent({
        action: args.action as string,
        dataUri: args.dataUri as string | undefined,
        packageName: args.packageName as string | undefined,
        extras: args.extras as Record<string, string> | undefined,
        requireChooser: args.requireChooser as boolean | undefined,
      });

    case 'getSystemSetting':
      return getSystemSetting(args.key as string);

    // --- media -----------------------------------------------------------

    case 'controlMedia':
      return controlMedia(args.command as MediaCommand);

    case 'adjustVolume':
      return adjustVolume(args.direction as VolumeDirection);

    // --- messaging and calls ---------------------------------------------

    case 'sendSms':
      return sendSms(args.phoneNumber as string, args.body as string);

    case 'readSms':
      return readSms(args.limit as number | undefined, args.fromNumber as string | undefined);

    case 'placeCall':
      return placeCall(args.phoneNumber as string);

    case 'endCall':
      return endCall();

    // --- device configuration --------------------------------------------

    case 'setSystemSetting':
      return setSystemSetting(args.key as string, args.value as string);

    case 'setRingerMode':
      return setRingerMode(args.mode as RingerMode);

    default:
      throw new Error(
        `No device function is wired for the tool "${tool}". ` +
          'It may have been added to the tool list without being connected here.',
      );
  }
};

/**
 * Taps a coordinate, for the rare case where nothing identifies the element.
 *
 * Not reachable through {@link invokeTool} on purpose. The agent should never be handed
 * a coordinate tap as an option, because it will use it - and a workflow generated from
 * coordinates breaks on the next app update (ADR 0009). This is exported for the screen
 * inspector, where a human is choosing deliberately.
 */
export const tapCoordinate = clickAt;
