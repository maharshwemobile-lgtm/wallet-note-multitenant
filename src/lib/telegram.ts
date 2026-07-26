// Minimal Telegram Bot API client. No SDK dependency — just fetch against
// https://api.telegram.org.
//
// Each Wallet Note user brings their own bot (their own token), so there is
// no single global token. In-conversation calls (sendMessage etc.) pull the
// active token from an AsyncLocalStorage context set once per webhook
// request by withBotToken() — this avoids threading a token argument through
// every function in telegramBot.ts. Admin calls (setWebhook, getMe) that run
// outside that context — e.g. when a user first saves their token — take the
// token as an explicit argument instead.

import { AsyncLocalStorage } from "node:async_hooks";

const tokenContext = new AsyncLocalStorage<string>();

/** Run `fn` with `token` as the active bot for any sendMessage/etc. calls inside it. */
export function withBotToken<T>(token: string, fn: () => Promise<T>): Promise<T> {
  return tokenContext.run(token, fn);
}

function activeToken(): string {
  const token = tokenContext.getStore();
  if (!token) throw new Error("No Telegram bot token in context — call within withBotToken()");
  return token;
}

const REQUEST_TIMEOUT_MS = 10_000;

// Throws on failure — used by setup/admin calls (setWebhook, getMe) where the
// caller needs to know something actually went wrong instead of failing
// silently.
async function call<T = unknown>(token: string, method: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description ?? `${method} failed`);
  return data.result as T;
}

// Non-throwing wrapper for in-conversation sends: a Telegram API hiccup must
// not abort the business logic — e.g. a withdrawal already committed to the
// database should not roll back just because the confirmation message failed
// to send.
async function callBestEffort<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T | undefined> {
  try {
    return await call<T>(activeToken(), method, payload);
  } catch (e) {
    console.error(`[telegram] ${method} failed:`, e instanceof Error ? e.message : e);
    return undefined;
  }
}

export interface InlineButton {
  text: string;
  callback_data: string;
}
export type InlineKeyboard = InlineButton[][];

export function keyboard(rows: InlineButton[][]): { inline_keyboard: InlineButton[][] } {
  return { inline_keyboard: rows };
}

export function btn(text: string, data: string): InlineButton {
  return { text, callback_data: data };
}

export async function sendMessage(
  chatId: string,
  text: string,
  opts?: { replyMarkup?: { inline_keyboard: InlineButton[][] }; parseMode?: "Markdown" | "HTML" }
) {
  return callBestEffort("sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: opts?.replyMarkup,
    parse_mode: opts?.parseMode,
  });
}

export async function editMessageText(
  chatId: string,
  messageId: number,
  text: string,
  opts?: { replyMarkup?: { inline_keyboard: InlineButton[][] } }
) {
  return callBestEffort("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    reply_markup: opts?.replyMarkup,
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
  return callBestEffort("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: showAlert });
}

// Admin calls: explicit token, real errors — used once when a user saves
// their bot token (to verify it and register the webhook), not from within
// an in-conversation flow.
export async function setWebhook(token: string, url: string, secretToken: string) {
  return call(token, "setWebhook", { url, secret_token: secretToken, allowed_updates: ["message", "callback_query"] });
}

export async function deleteWebhook(token: string) {
  return call(token, "deleteWebhook", {});
}

export async function getMe(token: string) {
  return call<{ id: number; username: string }>(token, "getMe", {});
}

// --- Update payload shapes (only the fields we use) ---
export interface TgUser {
  id: number;
  first_name: string;
  username?: string;
}
export interface TgMessage {
  message_id: number;
  chat: { id: number };
  from?: TgUser;
  text?: string;
}
export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}
