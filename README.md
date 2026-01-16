# cc-marketplace

A community plugin marketplace for **Claude Code**.

This repository is a **Marketplace** (not a single plugin). Add it to Claude Code, then install plugins from it.

---

## Requirements

- Claude Code with plugin support (Claude Code `1.0.33+` recommended)
- Bun: https://bun.sh/

---

## Add this marketplace

In Claude Code, run:

```text
/plugin marketplace add TBosak/cc-marketplace
````

Claude Code will register this marketplace under the name:

```text
tbosak
```

---

## Browse plugins

Open the plugin UI:

```text
/plugin
```

Then go to **Discover** (or the marketplace/marketplaces view) and look for plugins from **tbosak**.

---

## Install a plugin

Plugins from this marketplace are installed using the `@tbosak` suffix:

```text
/plugin install <plugin-id>@tbosak
```

### Example

```text
/plugin install agentarium@tbosak
```