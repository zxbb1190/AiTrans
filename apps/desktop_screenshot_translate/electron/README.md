# AiTrans Screenshot Translate

[中文说明](./README.zh-CN.md)

AiTrans is a Windows desktop app for screenshot translation and AI-assisted follow-up chat.
This README is for end users first: installation, first-time setup, daily usage, and update behavior.

## What AiTrans Can Do

- Capture a screen region and extract the source text
- Translate the captured content through an OpenAI-compatible endpoint
- Continue the same task in a lightweight AI chat window
- Keep the current conversation in local cache until you start a new chat or clear history

## Install

Choose one package:

- Installer: `desktop-screenshot-translate-<version>-x64.exe`
- Portable: `desktop-screenshot-translate-<version>-x64-portable.exe`

The installer build is recommended for most users.

## First Launch

On first launch, AiTrans will:

- show a floating anchor icon on the desktop
- create a local runtime config file
- open the setup window if translation settings are missing

Please configure at least:

- `base_url`
- `api_key`

A local OpenAI-compatible service is supported.

## Recommended Settings

In **Settings & Connection**, check these first:

- translation service `base_url`
- translation service `api_key`
- source language: auto / Chinese / English / Japanese
- capture shortcut
- send shortcut

## How To Use

### Screenshot Translation

- Click the floating anchor or use the capture shortcut
- Drag to select a region
- On multi-display setups, move the pointer to another screen to switch the active capture target
- After capture completes, the conversation window should reopen with the result

### Conversation Window

- A screenshot becomes a user message in the current thread
- The assistant reply includes source text and translated text
- You can keep typing in the bottom composer for follow-up translation or discussion
- When unpinned, the window collapses on blur
- When pinned, it stays visible

### Floating Anchor

- Left click: expand or collapse the conversation window
- Drag: move the floating anchor
- Right click: open actions such as new chat, clear history, settings, and update check

## Local Cache

- The current conversation is stored locally
- Choosing **New Chat** or **Clear History** asks for confirmation before removing the cached session

## OCR And Translation Notes

- OCR uses the bundled local runtime
- Translation uses an OpenAI-compatible API path
- If clear single-line English text is recognized poorly, try setting the source language to **English** before capturing again

## Updates

- The installer build supports update checking
- The portable build does not auto-update
- If an update source is configured, you can trigger an update check from the right-click menu

## Need Development Or Packaging Docs?

For development, packaging, and release workflows, use the monorepo docs instead of this user guide.
