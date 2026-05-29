# CLI Formatters

Prefer shared formatter helpers over command-local terminal layout math.

For list-style terminal output, use `renderAdaptiveTable` when columns need to fit changing terminal widths or changing response content. Command formatters should describe column intent with `minWidth`, `maxWidth`, `width`, and `align`; the renderer should handle measuring, truncating, and padding.

Avoid new formatter code that:

- Reads `process.stdout.columns` directly.
- Computes `fixedWidth`, `available`, or percentage-based column widths in command formatters.
- Calls `truncateToWidth(value, columnWidth - 2)` from every cell renderer.
- Duplicates padding or alignment logic with `padEnd` for table columns.

Use exact `width` only for genuinely stable columns, such as short status labels, frequencies, or fixed-width identifiers. Use flexible widths for user-controlled text such as names, URLs, descriptions, tags, and service names.

Markdown output should usually stay untruncated. The adaptive renderer delegates markdown output to `renderTable`, so terminal-specific layout constraints do not leak into `--output md`.
