// Dashboard — Due Today (Tasks) — iOS Home Screen Widget
// Requires the free "Scriptable" app from the App Store.
//
// SETUP:
// 1. Open Scriptable, tap + to create a new script, paste this whole file in.
// 2. Replace WIDGET_KEY below with your real WIDGET_API_KEY from Dashboard's .env
//    (same key as the Brain Dump widget — both use Dashboard's one widget key).
// 3. Tap the wrench icon (bottom right) > run once to test.
//    NOTE: manual test runs always preview the medium layout — Scriptable
//    only knows the real widget size (small vs medium) once it's actually
//    placed on your home screen, not when run manually inside the app.
// 4. Long-press your iPhone home screen > tap + (top left) > search "Scriptable"
//    > choose the SMALL or MEDIUM widget size > add it.
// 5. Long-press the new widget > Edit Widget > set "Script" to this script's name.
//
// The widget refreshes periodically on iOS's own schedule (usually every
// 15-60 min); tap the widget to jump straight into the app. This is
// read-only — check tasks off from the app itself, not from the widget.

const WIDGET_URL = "https://dashboard.megangibbs.net/api/widget/tasks";
const WIDGET_KEY = "PASTE_YOUR_WIDGET_API_KEY_HERE";
const APP_URL = "https://dashboard.megangibbs.net";

async function getData() {
  const req = new Request(`${WIDGET_URL}?key=${WIDGET_KEY}`);
  req.timeoutInterval = 10;
  try {
    return await req.loadJSON();
  } catch (e) {
    return { error: true };
  }
}

async function createWidget(data, size) {
  const isSmall = size === "small";
  const w = new ListWidget();
  w.backgroundColor = new Color("#121212");
  w.url = APP_URL;
  w.setPadding(14, 14, 14, 14);

  if (data.error) {
    const t = w.addText("Couldn't load Dashboard");
    t.font = Font.mediumSystemFont(13);
    t.textColor = new Color("#e05a5a");
    return w;
  }

  const title = w.addText(isSmall ? "✅ Due Today" : "✅ Due Today");
  title.font = Font.boldSystemFont(isSmall ? 13 : 15);
  title.textColor = new Color("#4a8fe7");
  w.addSpacer(isSmall ? 5 : 8);

  const open = data.open || [];

  if (open.length === 0) {
    w.addSpacer();
    const empty = w.addText("Nothing on the list");
    empty.font = Font.systemFont(12);
    empty.textColor = new Color("#9a9a9a");
    w.addSpacer();
    return w;
  }

  const count = w.addText(`${open.length} open`);
  count.font = Font.systemFont(10);
  count.textColor = new Color("#9a9a9a");
  w.addSpacer(isSmall ? 4 : 6);

  const shown = open.slice(0, isSmall ? 3 : 5);
  for (const task of shown) {
    const row = w.addStack();
    row.centerAlignContent();

    const box = row.addText("☐");
    box.font = Font.systemFont(isSmall ? 10 : 11);
    box.textColor = new Color("#4a8fe7");
    row.addSpacer(5);

    const text = row.addText(task.title);
    text.font = Font.mediumSystemFont(isSmall ? 11 : 12);
    text.textColor = new Color("#ffffff");
    text.lineLimit = 1;

    w.addSpacer(isSmall ? 3 : 4);
  }

  if (open.length > shown.length) {
    w.addSpacer(2);
    const more = w.addText(`+${open.length - shown.length} more`);
    more.font = Font.systemFont(9);
    more.textColor = new Color("#9a9a9a");
  }

  return w;
}

const data = await getData();
const size = config.widgetFamily || "medium"; // manual test runs default to medium — see note above
const widget = await createWidget(data, size);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  if (size === "small") {
    await widget.presentSmall();
  } else {
    await widget.presentMedium();
  }
}
Script.complete();
